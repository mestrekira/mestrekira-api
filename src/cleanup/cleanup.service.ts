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
};

@Injectable()
export class CleanupService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly mail: MailService,
  ) {}

  /**
   * days=90, warnDays=7 (avisa faltando 7 dias)
   * maxWarningsPerRun = 200 (limite de envios por execução)
   */
  async runInactiveCleanup(days = 90, warnDays = 7, maxWarningsPerRun = 200) {
    const warnThresholdDays = days - warnDays;

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
    JOIN task_entity t ON t."roomId"::text = r.id::text
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
    u."emailOptOut"
  FROM user_entity u
  LEFT JOIN last_activity la ON la.user_id = u.id::text
  WHERE LOWER(u.role) IN ('student', 'professor');
`);

    const now = new Date();
    let warned = 0;
    let deleted = 0;

    for (const u of rows) {
      // ✅ Limite de envios por execução
      if (warned >= maxWarningsPerRun) break;

      // ✅ Respeita opt-out
      if (u.emailOptOut) continue;

      const last = u.last_activity ?? (await this.getUserCreatedAt(u.id));

      const warnAt = this.addDays(last, warnThresholdDays);
      const deleteAt = this.addDays(last, days);

      // se já tem scheduledDeletionAt, respeita
      if (u.scheduledDeletionAt) {
        if (now >= new Date(u.scheduledDeletionAt)) {
          await this.usersService.removeUser(u.id);
          deleted++;
        }
        continue;
      }

      // período de aviso (>= warnAt e < deleteAt)
      if (!u.inactivityWarnedAt && now >= warnAt && now < deleteAt) {
        await this.sendInactivityEmail(u.id, u.email, u.name, deleteAt);
        await this.markWarnedAndSchedule(u.id, now, deleteAt);
        warned++;
        continue;
      }

      // passou do deleteAt sem aviso -> garante 7 dias a partir de agora
      if (!u.inactivityWarnedAt && now >= deleteAt) {
        const schedule = this.addDays(now, 7);
        await this.sendInactivityEmail(u.id, u.email, u.name, schedule);
        await this.markWarnedAndSchedule(u.id, now, schedule);
        warned++;
      }
    }

    return { ok: true, warned, deleted, checked: rows.length, maxWarningsPerRun };
  }

  private async getUserCreatedAt(userId: string): Promise<Date> {
    const r = await this.dataSource.query(
      `SELECT "createdAt" FROM user_entity WHERE id = $1 LIMIT 1`,
      [userId],
    );
    return new Date(r?.[0]?.createdAt);
  }

  private async markWarnedAndSchedule(userId: string, warnedAt: Date, scheduled: Date) {
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
   * ✅ E-mail real via Resend (MailService)
   */
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

    // ✅ link de unsubscribe com token assinado (expira)
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

  private addDays(d: Date, days: number) {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + days);
    return x;
  }

  // -----------------------------
  // Unsubscribe token (HMAC)
  // -----------------------------

  private buildUnsubscribeUrl(baseUrl: string, userId: string, email: string) {
    const token = this.signUnsubscribeToken({
      uid: userId,
      email,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 dias
    });
    return `${baseUrl}/api/mail/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  private signUnsubscribeToken(payload: { uid: string; email: string; exp: number }) {
    const secret =
      (process.env.MAIL_UNSUBSCRIBE_SECRET || '').trim() ||
      (process.env.CLEANUP_SECRET || '').trim();

    if (!secret) {
      // sem segredo, não gera token (evita link inseguro)
      return '';
    }

    const data = `${payload.uid}|${payload.email}|${payload.exp}`;
    const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    const raw = `${data}|${sig}`;
    return Buffer.from(raw, 'utf8').toString('base64url');
  }
}
