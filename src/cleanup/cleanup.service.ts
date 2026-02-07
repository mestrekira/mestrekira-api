import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  last_activity: Date | null;
  inactivityWarnedAt: Date | null;
  scheduledDeletionAt: Date | null;
};

@Injectable()
export class CleanupService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly mail: MailService,
  ) {}
  
  async runInactiveCleanup(days = 90, warnDays = 7) {
    const warnThresholdDays = days - warnDays;

    const rows: UserRow[] = await this.dataSource.query(`
      WITH student_last AS (
        SELECT e."studentId" AS user_id, MAX(e."createdAt") AS last_activity
        FROM essay_entity e
        WHERE e."isDraft" = false
        GROUP BY e."studentId"
      ),
      professor_last AS (
        SELECT r."professorId" AS user_id, MAX(t."createdAt") AS last_activity
        FROM room_entity r
        JOIN task_entity t ON t."roomId" = r.id
        GROUP BY r."professorId"
      ),
      last_activity AS (
        SELECT u.id AS user_id,
               CASE
                 WHEN LOWER(u.role) = 'student' THEN sl.last_activity
                 WHEN LOWER(u.role) = 'professor' THEN pl.last_activity
                 ELSE NULL
               END AS last_activity
        FROM user_entity u
        LEFT JOIN student_last sl ON sl.user_id = u.id
        LEFT JOIN professor_last pl ON pl.user_id = u.id
      )
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        la.last_activity,
        u."inactivityWarnedAt",
        u."scheduledDeletionAt"
      FROM user_entity u
      LEFT JOIN last_activity la ON la.user_id = u.id
      WHERE LOWER(u.role) IN ('student', 'professor');
    `);

    const now = new Date();
    let warned = 0;
    let deleted = 0;

    for (const u of rows) {
      const last = u.last_activity ?? (await this.getUserCreatedAt(u.id));

      const warnAt = this.addDays(last, warnThresholdDays);
      const deleteAt = this.addDays(last, days);

      if (u.scheduledDeletionAt) {
        if (now >= new Date(u.scheduledDeletionAt)) {
          await this.usersService.removeUser(u.id);
          deleted++;
        }
        continue;
      }

      if (!u.inactivityWarnedAt && now >= warnAt && now < deleteAt) {
        await this.sendInactivityEmail(u.email, u.name, deleteAt);
        await this.markWarnedAndSchedule(u.id, now, deleteAt);
        warned++;
        continue;
      }

      if (!u.inactivityWarnedAt && now >= deleteAt) {
        const schedule = this.addDays(now, 7);
        await this.sendInactivityEmail(u.email, u.name, schedule);
        await this.markWarnedAndSchedule(u.id, now, schedule);
        warned++;
      }
    }

    return { ok: true, warned, deleted, checked: rows.length };
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

  private async sendInactivityEmail(email: string, name: string, deletionDate: Date) {
    console.log(
      `[CLEANUP] Aviso -> ${email} (${name}) | exclusão em ${deletionDate.toISOString()}`
    );
  }

  private addDays(d: Date, days: number) {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + days);
    return x;
  }

   private async sendInactivityEmail(email: string, name: string, deletionDate: Date) {
    const baseUrl = (process.env.APP_WEB_URL || '').trim() || 'https://mestrekira.vercel.app';
    const downloadUrl = `${baseUrl}/export`; // depois você aponta pro endpoint real

    return this.mail.sendInactivityWarning({
      to: email,
      name,
      deletionDateISO: deletionDate.toISOString(),
      downloadUrl,
    });
  }
}


