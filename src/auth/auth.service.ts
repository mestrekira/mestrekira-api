import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

import { UserEntity } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly users: UsersService,

    private readonly mail: MailService,
    private readonly jwt: JwtService,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  // -----------------------------
  // Helpers
  // -----------------------------
  private normalizeEmail(email: string) {
    return String(email || '').trim().toLowerCase();
  }

  private getApiUrl() {
    return (
      (process.env.API_PUBLIC_URL || '').trim() ||
      'https://mestrekira-api.onrender.com'
    );
  }

  private getWebUrl() {
    // Ex.: https://www.mestrekira.com.br/app/frontend
    return (
      (process.env.APP_WEB_URL || '').trim() ||
      'https://www.mestrekira.com.br/app/frontend'
    );
  }

  private sha256Hex(input: string) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private newToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  private roleLower(role: any) {
    return String(role || '').trim().toLowerCase();
  }

  private async getUserByEmail(email: string) {
    const normalized = this.normalizeEmail(email);
    if (!normalized || !normalized.includes('@')) {
      throw new BadRequestException('E-mail inválido.');
    }
    return this.userRepo.findOne({ where: { email: normalized } });
  }

  // -----------------------------
  // Cadastro (cria + dispara verificação)
  // -----------------------------
  async registerProfessor(name: string, email: string, password: string) {
    const created = await this.users.createProfessor(name, email, password);
    await this.requestEmailVerification(created.email);

    return {
      ok: true,
      message: 'Cadastro criado. Confirme seu e-mail para acessar.',
      userId: created.id,
      email: created.email,
    };
  }

  async registerStudent(name: string, email: string, password: string) {
    const created = await this.users.createStudent(name, email, password);
    await this.requestEmailVerification(created.email);

    return {
      ok: true,
      message: 'Cadastro criado. Confirme seu e-mail para acessar.',
      userId: created.id,
      email: created.email,
    };
  }

  async registerSchool(name: string, email: string, password: string) {
    const created = await this.users.createSchool(name, email, password);
    await this.requestEmailVerification(created.email);

    return {
      ok: true,
      message: 'Cadastro da escola criado. Confirme seu e-mail para acessar.',
      userId: created.id,
      email: created.email,
    };
  }

  // -----------------------------
  // Login (bloqueia se não verificado) + JWT
  // -----------------------------
  async login(email: string, password: string) {
    const user = await this.users.validateUser(email, password);

    if (!user) {
      return { ok: false, error: 'Usuário ou senha inválidos' };
    }

    if (!user.emailVerified) {
      return {
        ok: false,
        error:
          'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada (e Spam) ou solicite um novo link.',
        emailVerified: false,
      };
    }

    const role = this.roleLower((user as any).role || 'student');

    const token = await this.jwt.signAsync({
      sub: user.id,
      role,
      // extras úteis para guards (opcional)
      mustChangePassword: !!(user as any).mustChangePassword,
    });

    return {
      ok: true,
      message: 'Login realizado.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role,

        professorType: (user as any).professorType ?? null,
        schoolId: (user as any).schoolId ?? null,
        mustChangePassword: !!(user as any).mustChangePassword,
      },
    };
  }

  // -----------------------------
  // Reenvio de verificação
  // Segurança: não revela se email existe (evita enumeração)
  // -----------------------------
  async requestEmailVerification(email: string) {
    const user = await this.getUserByEmail(email);

    // ✅ sempre responde ok
    if (!user) {
      return { ok: true, message: 'Se o e-mail existir, enviaremos um link.' };
    }

    if (user.emailVerified) {
      return { ok: true, message: 'E-mail já verificado.' };
    }

    const rawToken = this.newToken();
    const tokenHash = this.sha256Hex(rawToken);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.userRepo.update(
      { id: user.id },
      {
        emailVerifyTokenHash: tokenHash,
        emailVerifyTokenExpiresAt: expires,
        emailVerified: false,
        emailVerifiedAt: null,
      },
    );

    const verifyUrl = `${this.getApiUrl()}/auth/verify-email?token=${encodeURIComponent(rawToken)}`;

    await this.mail.sendEmailVerification({
      to: user.email,
      name: user.name,
      verifyUrl,
    });

    return {
      ok: true,
      message: 'Se o e-mail existir, enviaremos um link.',
    };
  }

  // -----------------------------
  // Confirmação via token
  // -----------------------------
  async verifyEmail(token: string) {
    const raw = String(token || '').trim();
    if (!raw) throw new BadRequestException('Token ausente.');

    const hash = this.sha256Hex(raw);

    const user = await this.userRepo.findOne({
      where: { emailVerifyTokenHash: hash },
    });

    if (!user) throw new BadRequestException('Token inválido.');
    if (!user.emailVerifyTokenExpiresAt) throw new BadRequestException('Token inválido.');
    if (new Date() > new Date(user.emailVerifyTokenExpiresAt)) {
      throw new BadRequestException('Token expirado. Solicite um novo.');
    }

    await this.userRepo.update(
      { id: user.id },
      {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerifyTokenHash: null,
        emailVerifyTokenExpiresAt: null,
      },
    );

    return { ok: true, message: 'E-mail verificado com sucesso.' };
  }

  // -----------------------------
  // (Opcional) reset verificação
  // -----------------------------
  async resetEmailVerification(userId: string) {
    const id = String(userId || '').trim();
    if (!id) throw new BadRequestException('userId ausente.');

    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    await this.userRepo.update(
      { id },
      {
        emailVerified: false,
        emailVerifiedAt: null,
        emailVerifyTokenHash: null,
        emailVerifyTokenExpiresAt: null,
      },
    );

    return { ok: true };
  }

  // -----------------------------
  // Admin debug: envia verificação por userId
  // -----------------------------
  async adminSendVerifyByUserId(userId: string) {
    const id = String(userId || '').trim();
    if (!id) throw new BadRequestException('userId ausente.');

    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    if (user.emailVerified) {
      return { ok: true, message: 'E-mail já verificado.', sentTo: user.email };
    }

    const rawToken = this.newToken();
    const tokenHash = this.sha256Hex(rawToken);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.userRepo.update(
      { id: user.id },
      {
        emailVerifyTokenHash: tokenHash,
        emailVerifyTokenExpiresAt: expires,
        emailVerified: false,
        emailVerifiedAt: null,
      },
    );

    const verifyUrl = `${this.getApiUrl()}/auth/verify-email?token=${encodeURIComponent(rawToken)}`;

    await this.mail.sendEmailVerification({
      to: user.email,
      name: user.name,
      verifyUrl,
    });

    this.logger.log(`Admin verify mail sent to ${user.email} (uid=${user.id})`);
    return { ok: true, sentTo: user.email, verifyUrl };
  }

  // =========================================================
  // ESQUECI MINHA SENHA
  // =========================================================
  async requestPasswordReset(email: string, role?: string) {
    const normalized = this.normalizeEmail(email);
    if (!normalized || !normalized.includes('@')) {
      throw new BadRequestException('E-mail inválido.');
    }

    const user = await this.userRepo.findOne({ where: { email: normalized } });

    // sempre responde ok (não revela se existe)
    if (!user) {
      return { ok: true, message: 'Se o e-mail existir, enviaremos um link.' };
    }

    const rawToken = this.newToken();
    const tokenHash = this.sha256Hex(rawToken);
    const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 min

    await this.userRepo.update(
      { id: user.id },
      {
        passwordResetTokenHash: tokenHash,
        passwordResetTokenExpiresAt: expires,
      },
    );

    const r = String(role || '').trim().toLowerCase();
    const safeRole = r === 'professor' || r === 'student' || r === 'school' ? r : '';

    const base = this.getWebUrl();
    const resetUrl =
      `${base}/reset-password.html?token=${encodeURIComponent(rawToken)}` +
      (safeRole ? `&role=${encodeURIComponent(safeRole)}` : '');

    await this.mail.sendPasswordReset({
      to: user.email,
      name: user.name,
      resetUrl,
    });

    return { ok: true, message: 'Se o e-mail existir, enviaremos um link.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const raw = String(token || '').trim();
    if (!raw) throw new BadRequestException('Token ausente.');

    const pass = String(newPassword || '');
    if (!pass || pass.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }

    const hash = this.sha256Hex(raw);

    const user = await this.userRepo.findOne({
      where: { passwordResetTokenHash: hash },
    });

    if (!user) throw new BadRequestException('Token inválido.');
    if (!user.passwordResetTokenExpiresAt) throw new BadRequestException('Token inválido.');
    if (new Date() > new Date(user.passwordResetTokenExpiresAt)) {
      throw new BadRequestException('Token expirado. Solicite um novo.');
    }

    const passwordHash = await bcrypt.hash(pass, 10);

    await this.userRepo.update(
      { id: user.id },
      {
        password: passwordHash,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
      },
    );

    return { ok: true, message: 'Senha redefinida com sucesso.' };
  }

  /**
   * Primeiro acesso (professor SCHOOL) → define senha e libera mustChangePassword
   */
  async firstPassword(userId: string, newPassword: string) {
    const id = String(userId || '').trim();
    const pass = String(newPassword || '');

    if (!id) throw new BadRequestException('Sessão inválida.');
    if (!pass || pass.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }

    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const role = String(user.role || '').toLowerCase();
    if (role !== 'professor') {
      throw new BadRequestException('Apenas professores usam este endpoint.');
    }

    const pType = String(user.professorType || '').toUpperCase();
    if (pType !== 'SCHOOL') {
      throw new BadRequestException('Apenas professores da escola usam este endpoint.');
    }

    if (!user.mustChangePassword) {
      return { ok: true, message: 'Senha já estava atualizada.' };
    }

    const hash = await bcrypt.hash(pass, 10);

    await this.userRepo.update(
      { id: user.id },
      { password: hash, mustChangePassword: false } as any,
    );

    return { ok: true, message: 'Senha definida com sucesso.' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const id = String(userId || '').trim();
    if (!id) throw new BadRequestException('userId ausente.');

    const curr = String(currentPassword || '');
    const pass = String(newPassword || '');

    if (!curr) throw new BadRequestException('Senha atual é obrigatória.');
    if (!pass || pass.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }

    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const ok = await bcrypt.compare(curr, String(user.password || ''));
    if (!ok) throw new BadRequestException('Senha atual inválida.');

    const hash = await bcrypt.hash(pass, 10);

    await this.userRepo.update(
      { id },
      { password: hash, mustChangePassword: false } as any,
    );

    return { ok: true, message: 'Senha alterada com sucesso.' };
  }
}
