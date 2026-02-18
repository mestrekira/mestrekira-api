import { Injectable, BadRequestException } from '@nestjs/common';
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

function normalizeRole(role: any) {
  return String(role || '').trim().toLowerCase();
}

@Injectable()
export class CleanupService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly mail: MailService,
  ) {}

  // ============================================================
  // ✅ AUTOMÁTICO (CRON) — mantido para compatibilidade
  // ============================================================
  /**
   * days=90, warnDays=7 (avisa faltando 7 dias)
   * maxWarningsPerRun = 200 (limite de envios por execução)
   *
   * Flags (ENV) opcionais:
   * - CLEANUP_AUTODELETE_ENABLED = "true" | "false" (default: true)
   * - CLEANUP_INCLUDE_PROFESSOR = "true" | "false" (default: true)
   */
  async runInactiveCleanup(days = 90, warnDays = 7, maxWarningsPerRun = 200) {
    days = this.safeInt(days, 90, 30, 3650);
    warnDays = this.safeInt(warnDays, 7, 1, days - 1);
    maxWarningsPerRun = this.safeInt(maxWarningsPerRun, 200, 1, 5000);

    const includeProfessor = this.envBool('CLEANUP_INCLUDE_PROFESSOR', true);
    const autoDeleteEnabled = this.envBool('CLEANUP_AUTODELETE_ENABLED', true);

    const warnThresholdDays = days - warnDays;
    const now = new Date();

    const rows = await this.fetchUsersWithLastActivity(includeProfessor);

    let warned = 0;
    let deleted = 0;

    for (const u of rows) {
      if (warned >= maxWarningsPerRun) break;

      // respeita opt-out
      if (u.emailOptOut) continue;

      const last = u.last_activity ?? (u.createdAt ?? (await this.getUserCreatedAt(u.id)));
      const warnAt = this.addDays(last, warnThresholdDays);
      const deleteAtDefault = this.addDays(last, days);

      // se já tem scheduledDeletionAt, respeita como data real
      if (u.scheduledDeletionAt) {
        const scheduled = new Date(u.scheduledDeletionAt);

        // ✅ chegou o dia: deleta somente se habilitado
        if (autoDeleteEnabled && now >= scheduled) {
          await this.usersService.removeUser(u.id);
          deleted++;
        }
        continue;
      }

      // janela de aviso (>= warnAt e < deleteAt)
      if (!u.inactivityWarnedAt && now >= warnAt && now < deleteAtDefault) {
        await this.sendInactivityEmail(u.id, u.email, u.name, deleteAtDefault);
        await this.markWarnedAndSchedule(u.id, now, deleteAtDefault);
        warned++;
        continue;
      }

      // passou do deleteAt sem aviso -> garante 7 dias a partir de agora
      if (!u.inactivityWarnedAt && now >= deleteAtDefault) {
        const schedule = this.addDays(now, 7);
        await this.sendInactivityEmail(u.id, u.email, u.name, schedule);
        await this.markWarnedAndSchedule(u.id, now, schedule);
        warned++;
      }
    }

    return { ok: true, warned, deleted, checked: rows.length, maxWarningsPerRun };
  }

  // ============================================================
  // ✅ PREVIEW (ADMIN) — NÃO envia e NÃO exclui
  // ============================================================
  async previewInactiveCleanup(days = 90, warnDays = 7) {
    days = this.safeInt(days, 90, 30, 3650);
    warnDays = this.safeInt(warnDays, 7, 1, days - 1);

    const includeProfessor = this.envBool('CLEANUP_INCLUDE_PROFESSOR', true);

    const warnThresholdDays = days - warnDays;
    const now = new Date();

    const rows = await this.fetchUsersWithLastActivity(includeProfessor);

    const warnCandidates: CleanupCandidate[] = [];
    const deleteCandidates: CleanupCandidate[] = [];

    for (const u of rows) {
      if (u.emailOptOut) continue;

      const last = u.last_activity ?? (u.createdAt ?? (await this.getUserCreatedAt(u.id)));
      const warnAt = this.addDays(last, warnThresholdDays);
      const deleteAtDefault = this.addDays(last, days);
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

      if (!u.inactivityWarnedAt && now >= warnAt && now < deleteAt) {
        warnCandidates.push({ ...base, reason: 'warn_window' });
        continue;
      }

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

  // ============================================================
  // ✅ ADMIN ações manuais
  // ============================================================

  async sendWarnings(userIds: string[], days = 90, warnDays = 7) {
    if (!Array.isArray(userIds) || userIds.length === 0) return { ok: true, sent: 0 };

    days = this.safeInt(days, 90, 30, 3650);
    warnDays = this.safeInt(warnDays, 7, 1, days - 1);

    const warnThresholdDays = days - warnDays;
    const now = new Date();
    let sent = 0;

    for (const uid of userIds.map(String)) {
      const u: UserRow[] = await this.dataSource.query(
        `SELECT id,email,name,role,"inactivityWarnedAt","scheduledDeletionAt","emailOptOut","createdAt"
         FROM user_entity WHERE id=$1 LIMIT 1`,
        [uid],
      );

      const user = u?.[0];
      if (!user) continue;
      if (user.emailOptOut) continue;
      if (user.inactivityWarnedAt) continue; // já avisou

      const lastActivity = await this.getLastActivityForUser(user.id, user.role, user.createdAt);
      const warnAt = this.addDays(lastActivity, warnThresholdDays);
      const deleteAtDefault = this.addDays(lastActivity, days);
      const deleteAt = user.scheduledDeletionAt ? new Date(user.scheduledDeletionAt) : deleteAtDefault;

      // só envia se estiver na janela correta
      if (now < warnAt || now >= deleteAt) continue;

      await this.sendInactivityEmail(user.id, user.email, user.name, deleteAt);

      await this.dataSource.query(
        `
        UPDATE user_entity
        SET "inactivityWarnedAt" = $2,
            "scheduledDeletionAt" = COALESCE("scheduledDeletionAt", $3)
        WHERE id = $1
        `,
        [user.id, now.toISOString(), deleteAt.toISOString()],
      );

      sent++;
    }

    return { ok: true, sent };
  }

  async deleteUsers(userIds: string[]) {
    if (!Array.isArray(userIds) || userIds.length === 0) return { ok: true, deleted: 0 };

    let deleted = 0;
    for (const uid of userIds.map(String)) {
      try {
        await this.usersService.removeUser(uid);
        deleted++;
      } catch {
        // ignora falhas individuais
      }
    }

    return { ok: true, deleted };
  }

  // ============================================================
  // Helpers
  // ============================================================

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

  private safeInt(v: any, fallback: number, min: number, max: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  private envBool(key: string, def: boolean) {
    const raw = String(process.env[key] || '').trim().toLowerCase();
    if (!raw) return def;
    if (raw === 'true' || raw === '1' || raw === 'yes') return true;
    if (raw === 'false' || raw === '0' || raw === 'no') return false;
    return def;
  }

  private addDays(d: Date, days: number) {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + days);
    return x;
  }

  private async getUserCreatedAt(userId: string): Promise<Date> {
    const r = await this.dataSource.query(
      `SELECT "createdAt" FROM user_entity WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const dt = r?.[0]?.createdAt ? new Date(r[0].createdAt) : new Date();
    if (Number.isNaN(dt.getTime())) return new Date();
    return dt;
  }

  private async fetchUsersWithLastActivity(includeProfessor: boolean): Promise<UserRow[]> {
    // ✅ professor_last com LEFT JOIN (professor sem tasks não “some”)
    // ✅ filtra professores se includeProfessor=false
    const roleFilter = includeProfessor
      ? `WHERE LOWER(u.role) IN ('student','professor')`
      : `WHERE LOWER(u.role) = 'student'`;

    return this.dataSource.query(`
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
      ${roleFilter};
    `);
  }

  private async getLastActivityForUser(
    userId: string,
    role: string,
    createdAt?: Date | null,
  ): Promise<Date> {
    const r = normalizeRole(role);

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

    if (createdAt) {
      const dt = new Date(createdAt);
      if (!Number.isNaN(dt.getTime())) return dt;
    }

    return this.getUserCreatedAt(userId);
  }

  // ============================================================
  // E-mail + Unsubscribe
  // ============================================================

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

    const unsubscribeUrl = this.buildUnsubscribeUrl(userId, email);

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

  private buildUnsubscribeUrl(userId: string, email: string) {
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
