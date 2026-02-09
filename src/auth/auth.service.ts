import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

import { UserEntity } from '../users/user.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly mail: MailService,
  ) {}

  async verifyEmail(token: string) {
    if (!token || typeof token !== 'string') {
      return { ok: false, error: 'Token ausente.' };
    }

    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userRepo.findOne({
      where: { emailVerifyTokenHash: hash },
    });

    if (!user) {
      return { ok: false, error: 'Token inválido.' };
    }

    if (!user.emailVerifyTokenExpiresAt || new Date() > new Date(user.emailVerifyTokenExpiresAt)) {
      return { ok: false, error: 'Token expirado. Solicite um novo.' };
    }

    // marca como verificado + limpa token
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerifyTokenHash = null;
    user.emailVerifyTokenExpiresAt = null;

    await this.userRepo.save(user);

    return { ok: true, message: 'E-mail verificado com sucesso.' };
  }

  async resendVerification(email: string) {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !e.includes('@')) {
      return { ok: false, error: 'E-mail inválido.' };
    }

    const user = await this.userRepo.findOne({ where: { email: e } });

    // não revela se existe ou não (boa prática)
    if (!user) {
      return { ok: true, message: 'Se este e-mail existir, enviaremos a confirmação.' };
    }

    if (user.emailVerified) {
      return { ok: true, message: 'Este e-mail já está verificado.' };
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.emailVerifyTokenHash = hash;
    user.emailVerifyTokenExpiresAt = expires;
    await this.userRepo.save(user);

    const apiUrl =
      (process.env.API_PUBLIC_URL || '').trim() ||
      'https://mestrekira-api.onrender.com';

    const verifyUrl = `${apiUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;

    await this.mail.sendEmailVerification({
      to: user.email,
      name: user.name,
      verifyUrl,
    });

    return { ok: true, message: 'E-mail de confirmação reenviado.' };
  }
}
