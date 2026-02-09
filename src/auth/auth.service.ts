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
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly mail: MailService,
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
  // 1) Emitir/reenviar verificação
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
  // 2) Confirmar verificação
  // -----------------------------
  async verifyEmail(token: string) {
    const raw = String(token || '').trim();
    if (!raw) throw new BadRequestException('Token ausente.');

    const hash = this.sha256Hex(raw);

    const user = await this.userRepo.findOne({
      where: { emailVerifyTokenHash: hash },
    });

    if (!user) {
      throw new BadRequestException('Token inválido.');
    }

    if (!user.emailVerifyTokenExpiresAt) {
      throw new BadRequestException('Token inválido.');
    }

    if (new Date() > new Date(user.emailVerifyTokenExpiresAt)) {
      throw new BadRequestException('Token expirado. Solicite um novo.');
    }

    if (user.emailVerified) {
      // já verificado — limpa token por segurança
      await this.userRepo.update(
        { id: user.id },
        {
          emailVerifyTokenHash: null,
          emailVerifyTokenExpiresAt: null,
        },
      );

      return { ok: true, message: 'E-mail já estava verificado.' };
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
  // 3) (Opcional) resetar verificação ao trocar e-mail
  //    Use se você quiser chamar isso após updateUser(emailChanged=true)
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
  // 4) (Opcional) Admin debug: gera e envia verificação por userId
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
