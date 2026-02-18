// src/admin/admin.service.ts
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

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

    const allowed = incoming === adminEmail || (!!recoveryEmail && incoming === recoveryEmail);
    if (!allowed) throw new UnauthorizedException('Credenciais inválidas.');

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

    if (params.email) {
      throw new BadRequestException(
        'E-mail do admin é controlado por ENV (ADMIN_EMAIL). Altere no Render.',
      );
    }

    if (params.password) {
      const p = String(params.password || '');
      if (p.length < 8) throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');

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

  async getCleanupPreview(days = 90, warnDays = 7) {
    // ✅ Reaproveita o motor real do CleanupService (sem duplicar SQL)
    return this.cleanupService.previewInactiveCleanup(days, warnDays);
  }

  async sendWarningsManual(userIds: string[], days = 90, warnDays = 7) {
    // ✅ Envia e-mail REAL + marca inactivityWarnedAt + scheduledDeletionAt
    // (o CleanupService já faz isso corretamente)
    return this.cleanupService.sendWarnings(userIds, days, warnDays);
  }

  async deleteUsersManual(userIds: string[]) {
    // ✅ Exclui usando UsersService via CleanupService (limpo, transacional)
    return this.cleanupService.deleteUsers(userIds);
  }
}
