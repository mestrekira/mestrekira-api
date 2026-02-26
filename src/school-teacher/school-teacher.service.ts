import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

import { SchoolTeacherInviteEntity } from './school-teacher-invite.entity';
import { UserEntity } from '../users/user.entity';

function roleOf(user: any) {
  return String(user?.role || '').trim().toLowerCase();
}

@Injectable()
export class SchoolTeacherService {
  constructor(
    @InjectRepository(SchoolTeacherInviteEntity)
    private readonly inviteRepo: Repository<SchoolTeacherInviteEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  private normalizeEmail(email: any) {
    return String(email || '').trim().toLowerCase();
  }

  private newCode() {
    return crypto.randomBytes(10).toString('base64url');
  }

  /**
   * ✅ Escola cria convite para professor
   */
  async createInvite(schoolId: string, teacherEmail: string) {
    const sid = String(schoolId || '').trim();
    const email = this.normalizeEmail(teacherEmail);

    if (!sid) throw new BadRequestException('schoolId é obrigatório.');
    if (!email.includes('@')) throw new BadRequestException('teacherEmail inválido.');

    const school = await this.userRepo.findOne({ where: { id: sid } });
    if (!school) throw new NotFoundException('Escola não encontrada.');
    if (roleOf(school) !== 'school') throw new ForbiddenException('Apenas escola pode convidar.');

    const code = this.newCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

    const invite = this.inviteRepo.create({
      schoolId: sid,
      teacherEmail: email,
      code,
      expiresAt,
      usedAt: null,
    });

    const saved = await this.inviteRepo.save(invite);

    return {
      ok: true,
      inviteId: saved.id,
      teacherEmail: saved.teacherEmail,
      code: saved.code,
      expiresAt: saved.expiresAt,
    };
  }

  /**
   * ✅ Professor aceita convite
   * - cria (ou reativa) professor
   * - seta SCHOOL_MANAGED, schoolId, mustChangePassword=true
   * - gera senha temporária e salva em bcrypt
   */
  async acceptInvite(code: string, teacherName: string) {
    const c = String(code || '').trim();
    const name = String(teacherName || '').trim();

    if (!c) throw new BadRequestException('code é obrigatório.');
    if (!name) throw new BadRequestException('teacherName é obrigatório.');

    const invite = await this.inviteRepo.findOne({
      where: {
        code: c,
        usedAt: null as any,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!invite) throw new BadRequestException('Convite inválido ou expirado.');

    // marca como usado
    invite.usedAt = new Date();
    await this.inviteRepo.save(invite);

    const email = this.normalizeEmail(invite.teacherEmail);

    // ✅ ATENÇÃO: findOne (não find) para não virar UserEntity[]
    let user = await this.userRepo.findOne({ where: { email } });

    // senha temporária
    const initialPassword = crypto.randomBytes(6).toString('base64url');
    const passwordHash = await bcrypt.hash(initialPassword, 10);

    // cria
    if (!user) {
      const created = this.userRepo.create({
        name,
        email,
        password: passwordHash,
        role: 'professor',

        professorType: 'SCHOOL_MANAGED',
        schoolId: invite.schoolId,
        mustChangePassword: true,
        trialMode: false,
        isActive: true,

        // convite como “controle” → pode marcar verificado
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerifyTokenHash: null,
        emailVerifyTokenExpiresAt: null,
      } as any);

      const saved = await this.userRepo.save(created);

      return {
        ok: true,
        created: true,
        teacherId: saved.id,
        teacherEmail: saved.email,
        initialPassword,
        mustChangePassword: true,
      };
    }

    // existe
    if (roleOf(user) !== 'professor') {
      throw new BadRequestException(
        'Este e-mail já está cadastrado como outro tipo de usuário.',
      );
    }

    // converte para SCHOOL_MANAGED e amarra na escola do convite
    (user as any).name = name || user.name;
    (user as any).professorType = 'SCHOOL_MANAGED';
    (user as any).schoolId = invite.schoolId;
    (user as any).mustChangePassword = true;
    (user as any).isActive = true;

    // redefine senha temporária
    user.password = passwordHash;

    // marca verificado (opcional)
    (user as any).emailVerified = true;
    (user as any).emailVerifiedAt = new Date();
    (user as any).emailVerifyTokenHash = null;
    (user as any).emailVerifyTokenExpiresAt = null;

    const saved = await this.userRepo.save(user);

    return {
      ok: true,
      created: false,
      teacherId: saved.id,
      teacherEmail: saved.email,
      initialPassword,
      mustChangePassword: true,
    };
  }

  async listInvites(schoolId: string) {
    const sid = String(schoolId || '').trim();
    if (!sid) throw new BadRequestException('schoolId é obrigatório.');

    return this.inviteRepo.find({
      where: { schoolId: sid },
      order: { createdAt: 'DESC' as any },
    });
  }
}
