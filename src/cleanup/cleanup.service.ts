import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UsersService } from '../users/users.service';

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
  ) {}

  /**
   * days=90, warnDays=7 (avisa faltando 7 dias)
   */
  async runInactiveCleanup(days = 90, warnDays = 7) {
    const warnThresholdDays = days - warnDays;

    // 1) pega candidatos (students + professors) com "última atividade"
    const rows: UserRow[] = await this.dataSource.query(
      `
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
      `,
    );

    const now = new Date();

    let warned = 0;
    let deleted = 0;

    for (const u of rows) {
      // regra: se nunca teve atividade, usa createdAt como base (conta “parada”)
      const base = u.last_activity ?? null;

      // Sem last_activity no SELECT acima não veio createdAt; então usamos o fallback via query rápida:
      const last = base ?? (await this.getUserCreatedAt(u.id));

      // datas alvo
      const warnAt = this.addDays(last, warnThresholdDays); // last + 83
      const deleteAt = this.addDays(last, days);            // last + 90

      // 4.1) se já tem scheduledDeletionAt, respeita ela (é a “promessa” pro usuário)
      if (u.scheduledDeletionAt) {
        if (now >= new Date(u.scheduledDeletionAt)) {
          // já venceu → apaga
          await this.usersService.removeUser(u.id);
          deleted++;
        }
        continue;
      }

      // 4.2) se está no período de aviso (>= warnAt e < deleteAt) e ainda não avisou
      if (!u.inactivityWarnedAt && now >= warnAt && now < deleteAt) {
        // aqui entra seu envio de email (por enquanto pode ser log)
        await this.sendInactivityEmail(u.email, u.name, deleteAt);

        // grava warned + agenda exclusão exatamente em deleteAt
        await this.markWarnedAndSchedule(u.id, now, deleteAt);
        warned++;
        continue;
      }

      // 4.3) se já passou do deleteAt e nunca avisou → NÃO apagar agora.
      // avisa e agenda +7 dias a partir de agora (garantindo “7 dias de aviso”)
      if (!u.inactivityWarnedAt && now >= deleteAt) {
        const schedule = this.addDays(now, 7);
        await this.sendInactivityEmail(u.email, u.name, schedule);
        await this.markWarnedAndSchedule(u.id, now, schedule);
        warned++;
        continue;
      }

      // se não entrou em nenhum caso, ignora (ainda ativo)
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

  // ✅ stub por enquanto: depois você pluga SendGrid/Resend/Nodemailer
  private async sendInactivityEmail(email: string, name: string, deletionDate: Date) {
    console.log(
      `[CLEANUP] Aviso inatividade -> ${email} (${name}) | exclusão em ${deletionDate.toISOString()}`,
    );
  }

  private addDays(d: Date, days: number) {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + days);
    return x;
  }
}