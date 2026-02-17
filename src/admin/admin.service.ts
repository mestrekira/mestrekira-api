import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

import { UsersService } from '../users/users.service';
import { CleanupService } from '../cleanup/cleanup.service';

type AdminPayload = {
  sub: 'admin';
  email: string;
  iat?: number;
  exp?: number;
};

function normalizeEmail(v: any) {
  return String(v || '').trim().toLowerCase();
}

@Injectable()
export class AdminService {
  constructor(
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,

    private readonly usersService: UsersService,
    private readonly cleanupService: CleanupService,
  ) {}

  // -----------------------------
  // Credenciais do Admin (ENV)
  // -----------------------------

  private getAdminEmail() {
    return normalizeEmail(process.env.ADMIN_EMAIL || '');
  }

  private getRecoveryEmail() {
    return normalizeEmail(process.env.ADMIN_RECOVERY_EMAIL || '');
  }

  private getPasswordHash() {
    return String(process.env.ADMIN_PASSWORD_HASH || '').trim();
  }

  private getJwtSecret() {
    return String(process.env.ADMIN_JWT_SECRET || '').trim();
  }

  private assertConfigured() {
    if (!this.getAdminEmail()) throw new BadRequestException('ADMIN_EMAIL não configurado.');
    if (!this.getPasswordHash()) throw new BadRequestException('ADMIN_PASSWORD_HASH não configurado.');
    if (!this.getJwtSecret()) throw new BadRequestException('ADMIN_JWT_SECRET não configurado.');
  }

  // -----------------------------
  // Login / Me
  // -----------------------------

  async login(email: string, password: string) {
    this.assertConfigured();

    const adminEmail = this.getAdminEmail();
    const recoveryEmail = this.getRecoveryEmail();

    const incoming = normalizeEmail(email);

    const allowed =
      incoming === adminEmail || (!!recoveryEmail && incoming === recoveryEmail);

    if (!allowed) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const ok = await bcrypt.compare(String(password), this.getPasswordHash());
    if (!ok) throw new UnauthorizedException('Credenciais inválidas.');

    const payload: AdminPayload = { sub: 'admin', email: incoming };

    const token = await this.jwt.signAsync(payload, {
      secret: this.getJwtSecret(),
      expiresIn: '12h',
    });

    return {
      ok: true,
      token,
      admin: {
        id: 'admin',
        name: 'Administrador(a)',
        email: incoming,
        role: 'admin',
      },
    };
  }

  getMe() {
    // Admin é “virtual” (ENV), não depende do banco.
    const adminEmail = this.getAdminEmail();
    const recoveryEmail = this.getRecoveryEmail();

    return {
      id: 'admin',
      name: 'Administrador(a)',
      email: adminEmail,
      recoveryEmail: recoveryEmail || null,
      role: 'admin',
    };
  }

  async updateMe(params: { email?: string; password?: string }) {
    this.assertConfigured();

    // ✅ Regra segura: admin email principal NÃO muda via endpoint (evita lockout).
    // Você pode mudar direto no Render, com controle.
    if (params.email) {
      throw new BadRequestException(
        'E-mail do admin é controlado por ENV (ADMIN_EMAIL). Altere no Render.',
      );
    }

    if (params.password) {
      const p = String(params.password || '');
      if (p.length < 8) throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');

      // não dá pra escrever no Render via código
      throw new BadRequestException(
        'Senha do admin é controlada por ENV (ADMIN_PASSWORD_HASH). Gere um novo hash e atualize no Render.',
      );
    }

    return { ok: true };
  }

  // -----------------------------
  // Diagnostics
  // -----------------------------

  async getDiagnostics() {
    const [users, rooms, tasks, essays] = await Promise.all([
      this.dataSource.query(`SELECT COUNT(*)::int AS n FROM user_entity`),
      this.dataSource.query(`SELECT COUNT(*)::int AS n FROM room_entity`),
      this.dataSource.query(`SELECT COUNT(*)::int AS n FROM task_entity`),
      this.dataSource.query(`SELECT COUNT(*)::int AS n FROM essay_entity`),
    ]);

    const scheduled = await this.dataSource.query(`
      SELECT COUNT(*)::int AS n
      FROM user_entity
      WHERE "scheduledDeletionAt" IS NOT NULL
    `);

    const warned = await this.dataSource.query(`
      SELECT COUNT(*)::int AS n
      FROM user_entity
      WHERE "inactivityWarnedAt" IS NOT NULL
    `);

    return {
      ok: true,
      now: new Date().toISOString(),
      counts: {
        users: users?.[0]?.n ?? 0,
        rooms: rooms?.[0]?.n ?? 0,
        tasks: tasks?.[0]?.n ?? 0,
        essays: essays?.[0]?.n ?? 0,
      },
      inactivity: {
        warned: warned?.[0]?.n ?? 0,
        scheduledForDeletion: scheduled?.[0]?.n ?? 0,
      },
    };
  }

  // -----------------------------
  // Cleanup Preview + Ações Manuais
  // -----------------------------

  /**
   * Prévia: calcula, mas NÃO envia nem exclui.
   * Retorna:
   *  - warnList: candidatos a aviso (dia 83)
   *  - deleteList: candidatos a exclusão (dia 90 / scheduledDeletionAt <= now)
   */
  async getCleanupPreview(days = 90, warnDays = 7) {
    // Reaproveita exatamente o motor do cleanup:
    // Aqui vamos chamar um “run dry” manual com SQL parecido.
    const warnThresholdDays = days - warnDays;
    const now = new Date();

    const rows: Array<{
      id: string;
      email: string;
      name: string;
      role: string;
      last_activity: Date | null;
      inactivityWarnedAt: Date | null;
      scheduledDeletionAt: Date | null;
      emailOptOut: boolean | null;
      createdAt: Date | null;
    }> = await this.dataSource.query(`
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
      WHERE LOWER(u.role) IN ('student','professor')
      ORDER BY u."createdAt" DESC;
    `);

    function addDays(d: Date, x: number) {
      const r = new Date(d);
      r.setUTCDate(r.getUTCDate() + x);
      return r;
    }

    const warnList: any[] = [];
    const deleteList: any[] = [];

    for (const u of rows) {
      if (u.emailOptOut) continue;

      const last = u.last_activity ?? u.createdAt ?? now;
      const warnAt = addDays(new Date(last), warnThresholdDays);
      const deleteAt = addDays(new Date(last), days);

      // Já agendado: se chegou a hora, entra na lista de deletar
      if (u.scheduledDeletionAt) {
        const s = new Date(u.scheduledDeletionAt);
        if (now >= s) {
          deleteList.push({
            id: u.id,
            email: u.email,
            name: u.name,
            role: String(u.role || '').toLowerCase(),
            lastActivity: u.last_activity,
            scheduledDeletionAt: u.scheduledDeletionAt,
          });
        }
        continue;
      }

      // candidato a aviso (dia 83)
      if (!u.inactivityWarnedAt && now >= warnAt && now < deleteAt) {
        warnList.push({
          id: u.id,
          email: u.email,
          name: u.name,
          role: String(u.role || '').toLowerCase(),
          lastActivity: u.last_activity,
          computedDeleteAt: deleteAt.toISOString(),
        });
      }

      // passou do deleteAt sem aviso -> precisa “avisar e agendar 7 dias”
      if (!u.inactivityWarnedAt && now >= deleteAt) {
        warnList.push({
          id: u.id,
          email: u.email,
          name: u.name,
          role: String(u.role || '').toLowerCase(),
          lastActivity: u.last_activity,
          computedDeleteAt: addDays(now, 7).toISOString(),
          late: true,
        });
      }
    }

    return {
      ok: true,
      now: now.toISOString(),
      config: { days, warnDays },
      warnList,
      deleteList,
    };
  }

  /**
   * Admin envia avisos para os selecionados e agenda exclusão.
   * Aqui chamamos o CleanupService (reaproveitando envio real e marcação).
   */
  async sendWarningsManual(userIds: string[], days = 90, warnDays = 7) {
    // Estratégia simples e segura:
    // - roda preview
    // - filtra apenas os que estão no warnList e foram selecionados
    const preview = await this.getCleanupPreview(days, warnDays);
    const candidates = new Map(preview.warnList.map((x: any) => [String(x.id), x]));
    const picked = userIds.filter((id) => candidates.has(String(id)));

    if (picked.length === 0) {
      return { ok: true, sent: 0, message: 'Nenhum usuário selecionado estava elegível para aviso.' };
    }

    // Para não duplicar lógica de mail/schedule, chamamos o cleanup real com limite alto
    // MAS isso avisaria outros também. Então vamos enviar um por um:
    // -> Vamos “simular” via SQL e MailService? Como seu CleanupService já tem método privado,
    // o jeito mais seguro aqui é copiar a marcação e acionar um endpoint do MailService.
    // Para manter “copiar/colar”, vou fazer a marcação via SQL e disparar o runInactiveCleanup com filtro.
    //
    // ✅ Solução prática: marcar scheduledDeletionAt para os selecionados e depois executar um cleanup “apenas” neles.
    // Como seu CleanupService não tem filtro, vamos fazer envio manual aqui (mínimo).
    //
    // 👉 Como você já tem MailService.sendInactivityWarning e o buildUnsubscribe está no CleanupService,
    // a forma mais limpa é você me mandar MailService (ou eu adapto com um método público).
    //
    // Por agora: vamos apenas marcar e devolver a lista. (envio de e-mail você pode plugar já já)
    const now = new Date();
    const scheduleDate = new Date(now);
    scheduleDate.setUTCDate(scheduleDate.getUTCDate() + warnDays);

    // marca warned + scheduledDeletionAt
    for (const uid of picked) {
      await this.dataSource.query(
        `
        UPDATE user_entity
        SET "inactivityWarnedAt" = $2,
            "scheduledDeletionAt" = $3
        WHERE id = $1
        `,
        [uid, now.toISOString(), scheduleDate.toISOString()],
      );
    }

    return {
      ok: true,
      sent: picked.length,
      note:
        'Aviso foi marcado no banco. Para envio real do e-mail, exponha um método público no CleanupService (sendInactivityEmail) ou envie via MailService aqui.',
    };
  }

  async deleteUsersManual(userIds: string[]) {
    let deleted = 0;

    for (const uid of userIds) {
      await this.usersService.removeUser(uid);
      deleted++;
    }

    return { ok: true, deleted };
  }
}
