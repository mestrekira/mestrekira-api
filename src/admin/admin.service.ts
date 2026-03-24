// src/admin/admin.service.ts
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
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
  private readonly logger = new Logger(AdminService.name);

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
    if (!this.getAdminEmail()) {
      throw new BadRequestException('ADMIN_EMAIL não configurado.');
    }
    if (!this.getPasswordHash()) {
      throw new BadRequestException('ADMIN_PASSWORD_HASH não configurado.');
    }
    if (!this.getJwtSecret()) {
      throw new BadRequestException('ADMIN_JWT_SECRET não configurado.');
    }
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
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

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
      if (p.length < 8) {
        throw new BadRequestException(
          'Senha deve ter no mínimo 8 caracteres.',
        );
      }

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
    const [
      studentsRow,
      professorsRow,
      schoolsRow,
      roomsRow,
      tasksRow,
      essaysRow,
      warnedRow,
      scheduledRow,
      usersRow,
    ] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM user_entity WHERE LOWER(role) = 'student'`,
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM user_entity WHERE LOWER(role) = 'professor'`,
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM user_entity WHERE LOWER(role) IN ('school','escola')`,
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM room_entity`,
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM task_entity`,
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM essay_entity`,
      ),
      this.dataSource.query(`
        SELECT COUNT(*)::int AS n
        FROM user_entity
        WHERE LOWER(role) = 'student'
          AND "inactivityWarnedAt" IS NOT NULL
      `),
      this.dataSource.query(`
        SELECT COUNT(*)::int AS n
        FROM user_entity
        WHERE LOWER(role) = 'student'
          AND "scheduledDeletionAt" IS NOT NULL
      `),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM user_entity`,
      ),
    ]);

    const students = Number(studentsRow?.[0]?.n || 0);
    const professors = Number(professorsRow?.[0]?.n || 0);
    const schools = Number(schoolsRow?.[0]?.n || 0);
    const rooms = Number(roomsRow?.[0]?.n || 0);
    const tasks = Number(tasksRow?.[0]?.n || 0);
    const essays = Number(essaysRow?.[0]?.n || 0);
    const warned = Number(warnedRow?.[0]?.n || 0);
    const scheduled = Number(scheduledRow?.[0]?.n || 0);
    const users = Number(usersRow?.[0]?.n || 0);

    return {
      ok: true,
      now: new Date().toISOString(),
      counts: {
        // novo modelo
        students,
        professors,
        schools,
        rooms,
        warned,
        scheduled,

        // compatibilidade com frontend legado
        users,
        tasks,
        essays,
      },
    };
  }

  // -----------------------------
  // Cleanup Preview + Ações Manuais
  // -----------------------------

  async getCleanupPreview(days = 90, warnDays = 7) {
    return this.cleanupService.previewInactiveCleanup(days, warnDays);
  }

  async sendWarningsManual(userIds: string[], days = 90, warnDays = 7) {
    const cleanIds = Array.isArray(userIds)
      ? [...new Set(userIds.map(String).filter(Boolean))]
      : [];

    if (cleanIds.length === 0) {
      throw new BadRequestException(
        'Nenhum userId válido foi informado.',
      );
    }

    const allowedRows = await this.dataSource.query(
      `
      SELECT id
      FROM user_entity
      WHERE id = ANY($1)
        AND LOWER(role) = 'student'
      `,
      [cleanIds],
    );

    const allowedIds = allowedRows.map((r: any) => String(r.id));

    if (allowedIds.length === 0) {
      throw new BadRequestException(
        'Nenhum estudante válido foi encontrado para aviso.',
      );
    }

    this.logger.warn(
      `[ADMIN] envio manual de avisos para ${allowedIds.length} estudante(s): ${allowedIds.join(', ')}`,
    );

    return this.cleanupService.sendWarnings(allowedIds, days, warnDays);
  }

  async deleteUsersManual(userIds: string[], confirm = false) {
    const cleanIds = Array.isArray(userIds)
      ? [...new Set(userIds.map(String).filter(Boolean))]
      : [];

    if (cleanIds.length === 0) {
      throw new BadRequestException(
        'Nenhum userId válido foi informado.',
      );
    }

    if (confirm !== true) {
      throw new BadRequestException(
        'Confirmação obrigatória: passe confirm=true para exclusão manual.',
      );
    }

    const allowedRows = await this.dataSource.query(
      `
      SELECT id
      FROM user_entity
      WHERE id = ANY($1)
        AND LOWER(role) = 'student'
      `,
      [cleanIds],
    );

    const allowedIds = allowedRows.map((r: any) => String(r.id));

    if (allowedIds.length === 0) {
      throw new BadRequestException(
        'Nenhum estudante válido foi encontrado para exclusão.',
      );
    }

    this.logger.warn(
      `[ADMIN] exclusão manual solicitada para ${allowedIds.length} estudante(s): ${allowedIds.join(', ')}`,
    );

    return this.cleanupService.deleteUsers(allowedIds, { confirm: true });
  }
}
