import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

import { UserEntity } from '../users/user.entity';
import { MailService } from '../mail/mail.service';

function normalizeRole(role: any): 'professor' | 'student' {
  const r = String(role || '').toLowerCase();
  if (r === 'professor') return 'professor';
  return 'student';
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly mail: MailService,
  ) {}

  // -----------------------------
  // REGISTER
  // -----------------------------
  async registerProfessor(name: string, email: string, password: string) {
    return this.registerBase({ name, email, password, role: 'professor' });
  }

  async registerStudent(name: string, email: string, password: string) {
    return this.registerBase({ name, email, password, role: 'student' });
  }

  private async registerBase(params: {
    name: string;
    email: string;
    password: string;
    role: 'professor' | 'student';
  }) {
    const name = String(params.name || '').trim();
    const email = String(params.email || '').trim().toLowerCase();
    const password = String(params.password || '');

    if (!name || !email || !password) {
      throw new BadRequestException('Preencha nome, e-mail e senha.');
    }
    if (!email.includes('@')) throw new BadRequestException('E-mail inválido.');
    if (password.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new BadRequestException('Este e-mail já está cadastrado.');

    // ✅ cria usuário já NÃO verificado
    const user = this.userRepo.create({
      name,
      email,
      password, // (mantido como está no seu projeto; ideal é hash no futuro)
      role: params.role,
      emailVerified: false,
      emailVerifiedAt: null,
      emailVerifyTokenHash: null,
      emailVerifyTokenExpiresAt: null,
    });

    const saved = await this.userRepo.save(user);

    // ✅ gera token + envia e-mail
    const verifyUrl = await this.createEmailVerification(saved.id, saved.email, saved.name);

    return {
      ok: true,
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: normalizeRole(saved.role),
      emailVerified: !!saved.emailVerified,
      verifyUrl, // útil só pra teste; você pode remover depois
      message: 'Cadastro criado. Verifique seu e-mail para liberar o login.',
    };
  }

  // -----------------------------
  // LOGIN (bloqueia se não verificado)
  // -----------------------------
  async login(email: string, password: string) {
    const e = String(email || '').trim().toLowerCase();
    const p = String(password || '');

    if (!e || !p) {
      throw new BadRequestException('Informe e-mail e senha.');
    }

    const user = await this.userRepo.findOne({ where: { email: e } });
    if (!user) return { error: 'Usuário ou senha inválidos' };
    if (user.password !== p) return { error: 'Usuário ou senha inválidos' };

    if (!user.emailVerified) {
      return {
        error: 'EMAIL_NOT_VERIFIED',
        message: 'Verifique seu e-mail para fazer login.',
      };
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role),
    };
  }

  // -----------------------------
  // EMAIL VERIFICATION
  // -----------------------------
  async resendVerification(email: string) {
    const e = String(email || '').trim().toLowerCase();
    if (!e) throw new BadRequestException('Informe o e-mail.');

    const user = await this.userRepo.findOne({ where: { email: e } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    if (user.emailVerified) {
      return { ok: true, message: 'E-mail já está verificado.' };
    }

    const verifyUrl = await this.createEmailVerification(user.id, user.email, user.name);
    return { ok: true, message: 'E-mail de verificação reenviado.', verifyUrl };
  }

  async verifyEmail(token: string) {
    const t = String(token || '').trim();
    if (!t) throw new BadRequestException('Token ausente.');

    const tokenHash = this.hashVerifyToken(t);

    const user = await this.userRepo.findOne({
      where: { emailVerifyTokenHash: tokenHash },
    });

    if (!user) {
      return { ok: false, error: 'Token inválido.' };
    }

    if (!user.emailVerifyTokenExpiresAt || user.emailVerifyTokenExpiresAt.getTime() < Date.now()) {
      return { ok: false, error: 'Token expirado. Solicite um novo.' };
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerifyTokenHash = null;
    user.emailVerifyTokenExpiresAt = null;

    await this.userRepo.save(user);

    return { ok: true, message: 'E-mail verificado com sucesso. Login liberado.' };
  }

  private async createEmailVerification(userId: string, email: string, name: string) {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashVerifyToken(token);

    const expiresMinutes = Number(process.env.EMAIL_VERIFY_EXPIRES_MIN || '1440'); // 24h
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

    // ✅ grava hash+expira
    await this.userRepo.update(
      { id: userId },
      {
        emailVerifyTokenHash: tokenHash,
        emailVerifyTokenExpiresAt: expiresAt,
      },
    );

    const apiUrl =
      (process.env.API_PUBLIC_URL || '').trim() ||
      'https://mestrekira-api.onrender.com';

    // link público (sem revelar hash)
    const verifyUrl = `${apiUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;

    await this.mail.sendEmailVerification({
      to: email,
      name,
      verifyUrl,
    });

    return verifyUrl;
  }

  private hashVerifyToken(token: string) {
    // ✅ “pepper” opcional pra reforçar
    const pepper = (process.env.EMAIL_VERIFY_PEPPER || '').trim();
    return crypto
      .createHash('sha256')
      .update(token + pepper)
      .digest('hex');
  }
}
