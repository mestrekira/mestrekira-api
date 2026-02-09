import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

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

  private sha256Hex(input: string) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private newToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  private async getUserByEmailOrThrow(email: string) {
    const normalized = this.normalizeEmail(email);
    if (!normalized || !normalized.includes('@')) {
      throw new BadRequestException('E-mail inválido.');
    }

    const user = await this.userRepo.findOne({ where: { email: normalized } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    return user;
  }

  // -----------------------------
  // Cadastro (cria + dispara verificação)
  // -----------------------------
  async registerProfessor(name: string, email: string, password: string) {
    const created = await this.users.createProfessor(name, email, password);
    await this.requestEmailVerification(created.email);

    return {
      ...created,
      message: 'Cadastro criado. Confirme seu e-mail para acessar.',
    };
  }

  async registerStudent(name: string, email: string, password: string) {
    const created = await this.users.createStudent(name, email, password);
    await this.requestEmailVerification(created.email);

    return {
      ...created,
      message: 'Cadastro criado. Confirme seu e-mail para acessar.',
    };
  }

  // -----------------------------
  // Login (bloqueia se não verificado)
  // -----------------------------
  async login(email: string, password: string) {
    const user = await this.users.validateUser(email, password);

    if (!user) {
      return { error: 'Usuário ou senha inválidos' };
    }

    if (!user.emailVerified) {
      return {
        error:
          'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada (e Spam) ou solicite um novo link.',
        emailVerified: false,
      };
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: (user.role || '').toLowerCase(),
      emailVerified: true,
    };
  }

  // -----------------------------
  // Reenvio de verificação (gera token + envia e-mail)
  // -----------------------------
  async requestEmailVerification(email: string) {
    const user = await this.getUserByEmailOrThrow(email);

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

    const verifyUrl = `${this.getApiUrl()}/auth/verify-email?token=${encodeURIComponent(
      rawToken,
    )}`;

    await this.mail.sendEmailVerification({
      to: user.email,
      name: user.name,
      verifyUrl,
    });

    return {
      ok: true,
      message: 'E-mail de verificação enviado.',
      sentTo: user.email,
    };
  }

  // -----------------------------
  // Confirmação via token (link do e-mail)
  // -----------------------------
  async verifyEmail(token: string) {
    const raw = String(token || '').trim();
    if (!raw) throw new BadRequestException('Token ausente.');

    const hash = this.sha256Hex(raw);

    const user = await this.userRepo.findOne({
      where: { emailVerifyTokenHash: hash },
    });

    if (!user) throw new BadRequestException('Token inválido.');
    if (!user.emailVerifyTokenExpiresAt) {
      throw new BadRequestException('Token inválido.');
    }
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
  // (Opcional) resetar verificação (se trocar e-mail)
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
  // ✅ Admin debug: envia verificação por userId
  // (isso resolve o erro TS2339 do seu controller)
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

    const verifyUrl = `${this.getApiUrl()}/auth/verify-email?token=${encodeURIComponent(
      rawToken,
    )}`;

    await this.mail.sendEmailVerification({
      to: user.email,
      name: user.name,
      verifyUrl,
    });

    this.logger.log(`Admin verify mail sent to ${user.email} (uid=${user.id})`);

    return { ok: true, sentTo: user.email, verifyUrl };
  }
}
