import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  last_activity: Date | null;
  inactivityWarnedAt: Date | null;
  scheduledDeletionAt: Date | null;
  emailOptOut: boolean | null;
  createdAt?: Date | null;
};

type CleanupCandidate = {
  id: string;
  email: string;
  name: string;
  role: string;
  lastActivityISO: string;
  warnAtISO: string;
  deleteAtISO: string;
  inactivityWarnedAtISO: string | null;
  scheduledDeletionAtISO: string | null;
  emailOptOut: boolean;
  reason: 'warn_window' | 'delete_due';
};

function normEmail(v: any) {
  return String(v || '').trim().toLowerCase();
}

@Injectable()
export class CleanupService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly mail: MailService,
  ) {}

  /**
   * ✅ Preview (para painel admin):
   * Retorna quem deve ser AVISADO (dia 83) e quem deve ser EXCLUÍDO (dia 90).
   * NÃO envia e-mail e NÃO exclui automaticamente.
   */
  async previewInactiveCleanup(days = 90, warnDays = 7) {
    // ✅ freio anti-parâmetro errado
    days = Number(days);
    warnDays = Number(warnDays);

    if (!Number.isFinite(days) || days < 30) days = 90;
    if (!Number.isFinite(warnDays) || warnDays < 1 || warnDays >= days) warnDays = 7;

    const warnThresholdDays = days - warnDays;
    const now = new Date();

    const rows: UserRow[] = await this.dataSource.query(`
      WITH student_last AS (
        SELECT e."studentId"::text AS user_id, MAX(e."createdAt") AS last_activity
        FROM essay_entity e
        WHERE e."isDraft" = false
        GROUP BY e."studentId"
      ),
      professor_last AS (
        SELECT r."professorId"::text AS user_id, MAX(t."createdAt") AS last_activity
        FROM room_entity r
        LEFT JOIN task_entity t ON t."roomId"::text = r.id::text
        GROUP BY r."professorId"
      ),
      last_activity AS (
        SELECT u.id::text AS user_id,
               CASE
                 WHEN LOWER(u.role) = 'student' THEN sl.last_activity
                 WHEN LOWER(u.role) = 'professor' THEN pl.last_activity
                 ELSE NULL
               END AS last_activity
        FROM user_entity u
        LEFT JOIN student_last sl ON sl.user_id = u.id::text
        LEFT JOIN professor_last pl ON pl.user_id = u.id::text
      )
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        la.last_activity,
        u."inactivityWarnedAt",
        u."scheduledDeletionAt",
        u."emailOptOut",
        u."createdAt"
      FROM user_entity u
      LEFT JOIN last_activity la ON la.user_id = u.id::text
      WHERE LOWER(u.role) IN ('student', 'professor');
    `);

    const warnCandidates: CleanupCandidate[] = [];
    const deleteCandidates: CleanupCandidate[] = [];

    const adminEmail = normEmail(process.env.ADMIN_EMAIL || '');
    const adminRecoveryEmail = normEmail(process.env.ADMIN_RECOVERY_EMAIL || '');

    for (const u of rows) {
      // ✅ Respeita opt-out
      if (u.emailOptOut) continue;

      // ✅ paranoia: não operar em email do admin (se algum dia aparecer na tabela)
      const em = normEmail(u.email);
      if (adminEmail && em === adminEmail) continue;
      if (adminRecoveryEmail && em === adminRecoveryEmail) continue;

      const last =
        u.last_activity ?? (u.createdAt ?? (await this.getUserCreatedAt(u.id)));

      const warnAt = this.addDays(last, warnThresholdDays);
      const deleteAtDefault = this.addDays(last, days);

      // Se já existe scheduledDeletionAt, ele vira a data real de exclusão
      const deleteAt = u.scheduledDeletionAt ? new Date(u.scheduledDeletionAt) : deleteAtDefault;

      const base: Omit<CleanupCandidate, 'reason'> = {
        id: String(u.id),
        email: String(u.email || ''),
        name: String(u.name || ''),
        role: String(u.role || ''),
        lastActivityISO: new Date(last).toISOString(),
        warnAtISO: new Date(warnAt).toISOString(),
        deleteAtISO: new Date(deleteAt).toISOString(),
        inactivityWarnedAtISO: u.inactivityWarnedAt ? new Date(u.inactivityWarnedAt).toISOString() : null,
        scheduledDeletionAtISO: u.scheduledDeletionAt ? new Date(u.scheduledDeletionAt).toISOString() : null,
        emailOptOut: !!u.emailOptOut,
      };

      // ✅ janela de AVISO: now >= warnAt e now < deleteAt e ainda NÃO avisou
      if (!u.inactivityWarnedAt && now >= warnAt && now < deleteAt) {
        warnCandidates.push({ ...base, reason: 'warn_window' });
        continue;
      }

      // ✅ EXCLUSÃO: now >= deleteAt
      if (now >= deleteAt) {
        deleteCandidates.push({ ...base, reason: 'delete_due' });
      }
    }

    return {
      ok: true,
      config: { days, warnDays, warnThresholdDays },
      totals: {
        checked: rows.length,
        warnCandidates: warnCandidates.length,
        deleteCandidates: deleteCandidates.length,
      },
      warnCandidates,
      deleteCandidates,
      nowISO: now.toISOString(),
    };
  }

  /**
   * ✅ Marcar usuário: define schedule e warnedAt
   */
  async markWarnedAndSchedule(userId: string, warnedAt: Date, scheduled: Date) {
    await this.dataSource.query(
      `
      UPDATE user_entity
      SET "inactivityWarnedAt" = $2,
          "scheduledDeletionAt" = $3
      WHERE id = $1
      `,
      [userId, warnedAt.toISOString(), scheduled.toISOString()],
    );
  }

  /**
   * ✅ Admin envia e-mail de aviso para uma lista de usuários (ids)
   * - marca inactivityWarnedAt = now
   * - agenda scheduledDeletionAt:
   *    - se ainda não passou do deleteAt: last + days
   *    - se já passou (atrasado): now + warnDays (ex.: 7 dias)
   */
  async sendWarnings(userIds: string[], days = 90, warnDays = 7) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return { ok: true, sent: 0, skipped: 0 };
    }

    days = Number(days);
    warnDays = Number(warnDays);
    if (!Number.isFinite(days) || days < 30) days = 90;
    if (!Number.isFinite(warnDays) || warnDays < 1 || warnDays >= days) warnDays = 7;

    const warnThresholdDays = days - warnDays;
    const now = new Date();

    const adminEmail = normEmail(process.env.ADMIN_EMAIL || '');
    const adminRecoveryEmail = normEmail(process.env.ADMIN_RECOVERY_EMAIL || '');

    let sent = 0;
    let skipped = 0;

    for (const uid of userIds) {
      const u: UserRow[] = await this.dataSource.query(
        `SELECT id,email,name,role,"inactivityWarnedAt","scheduledDeletionAt","emailOptOut","createdAt"
         FROM user_entity WHERE id=$1 LIMIT 1`,
        [uid],
      );
      const user = u?.[0];
      if (!user) { skipped++; continue; }
      if (user.emailOptOut) { skipped++; continue; }

      const em = normEmail(user.email);
      if (adminEmail && em === adminEmail) { skipped++; continue; }
      if (adminRecoveryEmail && em === adminRecoveryEmail) { skipped++; continue; }

      // já avisou, não reenviar
      if (user.inactivityWarnedAt) { skipped++; continue; }

      const lastActivity = await this.getLastActivityForUser(user.id, user.role, user.createdAt);
      const warnAt = this.addDays(lastActivity, warnThresholdDays);
      const deleteAtDefault = this.addDays(lastActivity, days);

      // Se já existe scheduledDeletionAt, usa ela como "deleteAt"
      const deleteAtExisting = user.scheduledDeletionAt ? new Date(user.scheduledDeletionAt) : null;

      // Caso normal: na janela 83..90
      const inWarnWindow = now >= warnAt && now < (deleteAtExisting ?? deleteAtDefault);

      // Caso atrasado: já passou do deleteAt e não avisou -> agenda +warnDays a partir de agora
      const isLate = now >= (deleteAtExisting ?? deleteAtDefault);

      if (!inWarnWindow && !isLate) { skipped++; continue; }

      // decide data final de exclusão
      const effectiveDeleteAt = isLate ? this.addDays(now, warnDays) : (deleteAtExisting ?? deleteAtDefault);

      await this.sendInactivityEmail(user.id, user.email, user.name, effectiveDeleteAt);

      // marca warnedAt agora; preserva schedule se já existia, senão coloca effectiveDeleteAt
      await this.dataSource.query(
        `
        UPDATE user_entity
        SET "inactivityWarnedAt" = $2,
            "scheduledDeletionAt" = COALESCE("scheduledDeletionAt", $3)
        WHERE id = $1
        `,
        [user.id, now.toISOString(), effectiveDeleteAt.toISOString()],
      );

      sent++;
    }

    return { ok: true, sent, skipped };
  }

  /**
   * ✅ Admin exclui manualmente uma lista de usuários (ids)
   */
  async deleteUsers(userIds: string[]) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return { ok: true, deleted: 0, skipped: 0 };
    }

    let deleted = 0;
    let skipped = 0;

    for (const uid of userIds) {
      try {
        await this.usersService.removeUser(uid);
        deleted++;
      } catch {
        skipped++;
      }
    }

    return { ok: true, deleted, skipped };
  }

  // -----------------------------
  // Helpers
  // -----------------------------

  private async getUserCreatedAt(userId: string): Promise<Date> {
    const r = await this.dataSource.query(
      `SELECT "createdAt" FROM user_entity WHERE id = $1 LIMIT 1`,
      [userId],
    );
    return new Date(r?.[0]?.createdAt);
  }

  private addDays(d: Date, days: number) {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + days);
    return x;
  }

  private async getLastActivityForUser(
    userId: string,
    role: string,
    createdAt?: Date | null,
  ): Promise<Date> {
    const r = String(role || '').toLowerCase();

    if (r === 'student') {
      const last = await this.dataSource.query(
        `
        SELECT MAX(e."createdAt") AS last_activity
        FROM essay_entity e
        WHERE e."isDraft" = false AND e."studentId" = $1
        `,
        [userId],
      );
      const dt = last?.[0]?.last_activity ? new Date(last[0].last_activity) : null;
      if (dt && !Number.isNaN(dt.getTime())) return dt;
    }

    if (r === 'professor') {
      const last = await this.dataSource.query(
        `
        SELECT MAX(t."createdAt") AS last_activity
        FROM room_entity r
        LEFT JOIN task_entity t ON t."roomId"::text = r.id::text
        WHERE r."professorId" = $1
        `,
        [userId],
      );
      const dt = last?.[0]?.last_activity ? new Date(last[0].last_activity) : null;
      if (dt && !Number.isNaN(dt.getTime())) return dt;
    }

    if (createdAt) return new Date(createdAt);
    return await this.getUserCreatedAt(userId);
  }

  // -----------------------------
  // E-mail + Unsubscribe
  // -----------------------------

  private async sendInactivityEmail(
    userId: string,
    email: string,
    name: string,
    deletionDate: Date,
  ) {
    const baseUrl =
      (process.env.APP_WEB_URL || '').trim() || 'https://www.mestrekira.com.br';

    const roomId = await this.getAnyRoomIdForUser(userId);

    const downloadUrl = roomId
      ? `${baseUrl}/app/frontend/desempenho.html?roomId=${encodeURIComponent(roomId)}`
      : `${baseUrl}`;

    const unsubscribeUrl = this.buildUnsubscribeUrl(baseUrl, userId, email);

    return this.mail.sendInactivityWarning({
      to: email,
      name,
      deletionDateISO: deletionDate.toISOString(),
      downloadUrl,
      unsubscribeUrl,
    });
  }

  private async getAnyRoomIdForUser(userId: string): Promise<string | null> {
    const enr = await this.dataSource.query(
      `
      SELECT "roomId"
      FROM enrollment_entity
      WHERE "studentId" = $1
      ORDER BY id DESC
      LIMIT 1
      `,
      [userId],
    );
    if (enr?.[0]?.roomId) return String(enr[0].roomId);

    const room = await this.dataSource.query(
      `
      SELECT id
      FROM room_entity
      WHERE "professorId" = $1
      ORDER BY id DESC
      LIMIT 1
      `,
      [userId],
    );
    if (room?.[0]?.id) return String(room[0].id);

    return null;
  }

  private buildUnsubscribeUrl(_baseUrl: string, userId: string, email: string) {
    const apiUrl =
      (process.env.API_PUBLIC_URL || '').trim() ||
      'https://mestrekira-api.onrender.com';

    const token = this.signUnsubscribeToken({
      uid: userId,
      email,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    if (!token) return '';
    return `${apiUrl}/mail/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  private signUnsubscribeToken(payload: { uid: string; email: string; exp: number }) {
    const secret =
      (process.env.MAIL_UNSUBSCRIBE_SECRET || '').trim() ||
      (process.env.CLEANUP_SECRET || '').trim();

    if (!secret) return '';

    const data = `${payload.uid}|${payload.email}|${payload.exp}`;
    const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    const raw = `${data}|${sig}`;
    return Buffer.from(raw, 'utf8').toString('base64url');
  }
}
