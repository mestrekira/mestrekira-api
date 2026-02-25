import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';

import { UserEntity } from '../users/user.entity';
import { SchoolTeacherInviteEntity } from './school-teacher-invite.entity';

@Injectable()
export class SchoolTeacherService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(SchoolTeacherInviteEntity)
    private readonly inviteRepo: Repository<SchoolTeacherInviteEntity>,

    private readonly jwt: JwtService,
  ) {}

  private normalizeEmail(email: any) {
    return String(email || '').trim().toLowerCase();
  }

  private sha256Hex(input: string) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private newCode6() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  async sendCode(email: string) {
    const e = this.normalizeEmail(email);
    if (!e || !e.includes('@')) throw new BadRequestException('E-mail inválido.');

    // precisa existir como professor gerenciado por escola
    const teacher = await this.userRepo.findOne({ where: { email: e } });
    if (!teacher) throw new NotFoundException('Professor não encontrado.');

    const role = String(teacher.role || '').toLowerCase();
    if (role !== 'professor') {
      throw new BadRequestException('Este e-mail não pertence a um professor.');
    }

    const pType = String(teacher.professorType || '').toUpperCase();
    if (pType !== 'SCHOOL') {
      throw new BadRequestException(
        'Este professor não é cadastrado pela escola.',
      );
    }

    if (!teacher.schoolId) {
      throw new BadRequestException('Professor sem schoolId (vínculo inválido).');
    }

    // reutiliza invite válido (evita spam)
    const now = new Date();
    const existing = await this.inviteRepo.findOne({
      where: {
        teacherEmail: e,
        schoolId: teacher.schoolId,
        usedAt: null,
        expiresAt: MoreThan(now),
      },
      order: { createdAt: 'DESC' as any },
    });

    if (existing) {
      // Aqui você normalmente enviaria e-mail com o código original.
      // Como a gente guarda só hash, vamos gerar um novo para envio.
      // (recomendado: não reutilizar se não tiver o código em claro)
    }

    const code = this.newCode6();
    const codeHash = this.sha256Hex(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    const invite = this.inviteRepo.create({
      schoolId: teacher.schoolId,
      teacherEmail: e,
      teacherName: teacher.name,
      codeHash,
      expiresAt,
      usedAt: null,
    });

    await this.inviteRepo.save(invite);

    /**
     * ✅ Envio de e-mail:
     * aqui você pode integrar com seu MailService.
     * Para não quebrar build (sem mexer no MailService agora),
     * retornamos ok e, em dev, você pode logar o code.
     */
    const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (!isProd) {
      // ajuda no teste local
      return { ok: true, message: 'Código gerado (DEV).', code };
    }

    return { ok: true, message: 'Se o e-mail existir, enviaremos um código.' };
  }

  async verifyCode(email: string, code: string) {
    const e = this.normalizeEmail(email);
    const c = String(code || '').trim().toUpperCase();

    if (!e || !e.includes('@')) throw new BadRequestException('E-mail inválido.');
    if (!c) throw new BadRequestException('Código é obrigatório.');

    const teacher = await this.userRepo.findOne({ where: { email: e } });
    if (!teacher) throw new NotFoundException('Professor não encontrado.');

    const role = String(teacher.role || '').toLowerCase();
    if (role !== 'professor') {
      throw new BadRequestException('Este e-mail não pertence a um professor.');
    }

    const pType = String(teacher.professorType || '').toUpperCase();
    if (pType !== 'SCHOOL') {
      throw new BadRequestException(
        'Este professor não é cadastrado pela escola.',
      );
    }

    if (!teacher.schoolId) {
      throw new BadRequestException('Professor sem schoolId (vínculo inválido).');
    }

    const now = new Date();
    const invite = await this.inviteRepo.findOne({
      where: {
        teacherEmail: e,
        schoolId: teacher.schoolId,
        usedAt: null,
        expiresAt: MoreThan(now),
      },
      order: { createdAt: 'DESC' as any },
    });

    if (!invite) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    const hash = this.sha256Hex(c);
    if (hash !== invite.codeHash) {
      throw new BadRequestException('Código inválido ou expirado.');
    }

    invite.usedAt = new Date();
    await this.inviteRepo.save(invite);

    const token = await this.jwt.signAsync({
      sub: teacher.id,
      role: 'professor',
    });

    return {
      ok: true,
      token,
      user: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        role: 'professor',
        professorType: teacher.professorType,
        mustChangePassword: !!teacher.mustChangePassword,
        schoolId: teacher.schoolId,
      },
    };
  }
}