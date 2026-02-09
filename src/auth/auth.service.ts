import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { UserEntity } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async verifyEmail(token: string) {
    if (!token) throw new BadRequestException('Token ausente.');

    const secret = (process.env.MAIL_VERIFY_SECRET || '').trim();
    if (!secret) throw new BadRequestException('MAIL_VERIFY_SECRET ausente.');

    const tokenHash = crypto
      .createHash('sha256')
      .update(`${token}.${secret}`)
      .digest('hex');

    const user = await this.userRepo.findOne({
      where: { emailVerifyTokenHash: tokenHash },
    });

    if (!user) throw new BadRequestException('Token inválido.');
    if (!user.emailVerifyTokenExpiresAt) throw new BadRequestException('Token inválido.');
    if (new Date() > new Date(user.emailVerifyTokenExpiresAt)) {
      throw new BadRequestException('Token expirado. Solicite novo envio.');
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerifyTokenHash = null;
    user.emailVerifyTokenExpiresAt = null;

    await this.userRepo.save(user);

    return { ok: true, message: 'E-mail verificado com sucesso.' };
  }
}
