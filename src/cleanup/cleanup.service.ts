// cleanup.service.ts (refatorado)
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

export type CleanupCandidate = {
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

type CleanupConfig = {
  days: number;          // ex: 90
  warnDays: number;      // ex: 7
  warnThresholdDays: number; // days - warnDays (ex: 83)
  includeProfessor: boolean;
};

type CandidateCompute = {
  now: Date;
  config: CleanupConfig;
  warnCandidates: CleanupCandidate[];
  deleteCandidates: CleanupCandidate[];
  totals: { checked: number; warnCandidates: number; deleteCandidates: number };
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
  // ✅ API CENTRAL: computeCandidates (fonte única)
  // ============================================================
  async computeCandidates(rawDays = 90, rawWarnDays = 7): Promise<CandidateCompute> {
    const days = this.safeInt(rawDays, 90, 30, 3650);
    const warnDays = this.safeInt(rawWarnDays, 7, 1, days - 1);

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

      // Se já está agendado, scheduled é a verdade
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

      // janela de aviso (ainda não avisado)
      if (!u.inactivityWarnedAt && now >= warnAt && now < deleteAt) {
        warnCandidates.push({ ...base, reason: 'warn_window' });
        continue;
      }

      // vencido (pelo scheduled ou pelo default)
      if (now >= deleteAt) {
        deleteCandidates.push({ ...base, reason: 'delete_due' });
      }
    }

    return {
      now,
      config: { days, warnDays, warnThresholdDays, includeProfessor },
      totals: {
        checked: rows.length,
        warnCandidates: warnCandidates.length,
        deleteCandidates: deleteCandidates.length,
      },
      warnCandidates,
      deleteCandidates,
    };
  }

  // ============================================================
  // ✅ AUTOMÁTICO (CRON) — compatível, mas agora usa computeCandidates()
  // ============================================================
  async runInactiveCleanup(days = 90, warnDays = 7, maxWarningsPerRun = 200) {
    maxWarningsPerRun = this.safeInt(maxWarningsPerRun, 200, 1, 5000);

    const autoDeleteEnabled = this.envBool('CLEANUP_AUTODELETE_ENABLED', true);
    const includeProfessor = this.envBool('CLEANUP_INCLUDE_PROFESSOR', true);
    // mantém coerência com computeCandidates
    const computed = await this.computeCandidates(days, warnDays);

    // computeCandidates já filtrou opt-out e etc.
    // Limite de envios por execução
    const warnSlice = computed.warnCandidates.slice(0, maxWarningsPerRun);

    let warned = 0;
    for (const c of warnSlice) {
      // Revalida estado atual pra evitar corrida
      const fresh = await this.getUserRowById(c.id);
      if (!fresh) continue;
      if (fresh.emailOptOut) continue;
      if (fresh.inactivityWarnedAt) continue;

      const deleteAt = new Date(c.deleteAtISO);
      await this.sendInactivityEmail(fresh.id, fresh.email, fresh.name, deleteAt);
      await this.markWarnedAndSchedule(fresh.id, computed.now, deleteAt);
      warned++;
    }

    let deleted = 0;
    if (autoDeleteEnabled) {
      // aqui só deletamos o que está realmente elegível por regra dura
      for (const c of computed.deleteCandidates) {
        const okToDelete = await this.isReallyDeletable(c.id, computed.now);
        if (!okToDelete) continue;

        try {
          await this.usersService.removeUser(c.id);
          deleted++;
        } catch {
          // ignora falhas individuais
        }
      }
    }

    return {
      ok: true,
      warned,
      deleted,
      checked: computed.totals.checked,
      maxWarningsPerRun,
      includeProfessor,
      nowISO: computed.now.toISOString(),
    };
  }

  // ============================================================
  // ✅ PREVIEW (ADMIN)
  // ============================================================
  async previewInactiveCleanup(days = 90, warnDays = 7) {
    const computed = await this.computeCandidates(days, warnDays);
    return {
      ok: true,
      config: computed.config,
      totals: computed.totals,
      warnCandidates: computed.warnCandidates,
      deleteCandidates: computed.deleteCandidates,
      nowISO: computed.now.toISOString(),
    };
  }

  // ============================================================
  // ✅ ADMIN: enviar avisos (manual)
  // ============================================================
  async sendWarnings(userIds: string[], days = 90, warnDays = 7) {
    if (!Array.isArray(userIds) || userIds.length === 0) return { ok: true, sent: 0 };

    // Use computeCandidates como filtro principal
    const computed = await this.computeCandidates(days, warnDays);
    const allowedSet = new Set(computed.warnCandidates.map((c) => c.id));

    let sent = 0;
    for (const uid of userIds.map(String)) {
      if (!allowedSet.has(uid)) continue;

      const user = await this.getUserRowById(uid);
      if (!user) continue;
      if (user.emailOptOut) continue;
      if (user.inactivityWarnedAt) continue;

      const candidate = computed.warnCandidates.find((c) => c.id === uid);
      if (!candidate) continue;

      const deleteAt = new Date(candidate.deleteAtISO);
      await this.sendInactivityEmail(user.id, user.email, user.name, deleteAt);
      await this.markWarnedAndSchedule(user.id, computed.now, deleteAt);
      sent++;
    }

    return { ok: true, sent };
  }

  // ============================================================
  // ✅ ADMIN: deletar (manual) — AGORA COM TRAVA FORTE
  // ============================================================
  async deleteUsers(userIds: string[], opts?: { confirm?: boolean }) {
    if (!Array.isArray(userIds) || userIds.length === 0) return { ok: true, deleted: 0 };

    // Exigir confirmação explícita para ações destrutivas
    if (!opts?.confirm) {
      throw new BadRequestException('Confirmação obrigatória: passe confirm=true para deletar usuários.');
    }

    const now = new Date();
    let deleted = 0;
    let blocked = 0;

    for (const uid of userIds.map(String)) {
      const okToDelete = await this.isReallyDeletable(uid, now);
      if (!okToDelete) {
        blocked++;
        continue;
      }

      try {
        await this.usersService.removeUser(uid);
        deleted++;
      } catch {
        // ignora falhas individuais
      }
    }

    return { ok: true, deleted, blocked, nowISO: now.toISOString() };
  }

  // ============================================================
  // ✅ REGRA DURA: só deleta se realmente vencido
  // - se tem scheduledDeletionAt: now >= scheduledDeletionAt
  // - senão: exige warned e now >= lastActivity + days (default 90)
  // ============================================================
  private async isReallyDeletable(userId: string, now: Date, days = 90): Promise<boolean> {
    const user = await this.getUserRowById(userId);
    if (!user) return false;

    // opt-out não impede delete (apenas e-mail), mas você pode decidir
    // aqui vamos permitir delete mesmo com opt-out

    if (user.scheduledDeletionAt) {
      const scheduled = new Date(user.scheduledDeletionAt);
      return !Number.isNaN(scheduled.getTime()) && now >= scheduled;
    }

    // Sem agendamento: só deleta se avisou e passou o prazo total
    if (!user.inactivityWarnedAt) return false;

    const last = await this.getLastActivityForUser(user.id, user.role, user.createdAt);
    const deleteAtDefault = this.addDays(last, days);
    return now >= deleteAtDefault;
  }

  private async getUserRowById(id: string): Promise<UserRow | null> {
    const u: UserRow[] = await this.dataSource.query(
      `SELECT id,email,name,role,"inactivityWarnedAt","scheduledDeletionAt","emailOptOut","createdAt"
       FROM user_entity WHERE id=$1 LIMIT 1`,
      [String(id)],
    );
    return u?.[0] || null;
  }

  // ============================================================
  // Helpers (mantidos / reaproveitados)
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
  // E-mail + Unsubscribe (mantido)
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
