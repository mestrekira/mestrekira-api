import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as crypto from 'crypto';

import { UserEntity } from './user.entity';
import { EssayEntity } from '../essays/essay.entity';
import { RoomEntity } from '../rooms/room.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { TaskEntity } from '../tasks/task.entity';
import { MailService } from '../mail/mail.service';

function normalizeRole(role: any): 'professor' | 'student' {
  const r = String(role || '').toLowerCase();
  if (r === 'professor') return 'professor';
  if (r === 'student') return 'student';
  if (String(role).toUpperCase() === 'PROFESSOR') return 'professor';
  return 'student';
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,

    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,

    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,

    private readonly dataSource: DataSource,
    private readonly mail: MailService,
  ) {}

  async createProfessor(name: string, email: string, password: string) {
    return this.createUserWithVerification({ name, email, password, role: 'professor' });
  }

  async createStudent(name: string, email: string, password: string) {
    return this.createUserWithVerification({ name, email, password, role: 'student' });
  }

  private async createUserWithVerification(params: {
    name: string;
    email: string;
    password: string;
    role: 'student' | 'professor';
  }) {
    let { name, email, password, role } = params;

    email = String(email || '').trim().toLowerCase();

    if (!email.includes('@')) throw new BadRequestException('E-mail inválido.');
    if (!password || password.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new BadRequestException('Este e-mail já está cadastrado.');

    // token (cru) e hash
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('base64url');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const user = this.userRepo.create({
      name,
      email,
      password,
      role,
      emailVerified: false,
      emailVerifiedAt: null,
      emailVerifyTokenHash: tokenHash,
      emailVerifyTokenExpiresAt: expires,
      emailOptOut: false,
    });

    const saved = await this.userRepo.save(user);

    // link de verificação
    const apiUrl =
      (process.env.API_PUBLIC_URL || '').trim() ||
      'https://mestrekira-api.onrender.com';

    const verifyUrl = `${apiUrl}/mail/verify-email?token=${encodeURIComponent(token)}`;

    await this.mail.sendEmailVerification({
      to: email,
      name,
      verifyUrl,
    });

    // ⚠️ não retorne senha
    return {
      ok: true,
      id: saved.id,
      email: saved.email,
      role: normalizeRole(saved.role),
      emailVerified: saved.emailVerified,
      message: 'Cadastro criado. Verifique seu e-mail para liberar o login.',
    };
  }

  async findByEmail(email: string) {
    email = String(email || '').trim().toLowerCase();
    return this.userRepo.findOne({ where: { email } });
  }

  async findAll() {
    return this.userRepo.find();
  }

  async validateUser(email: string, password: string) {
    const user = await this.findByEmail(email);
    if (!user) return null;
    if (user.password !== password) return null;

    user.role = normalizeRole(user.role);
    return user;
  }

  async findById(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role),
      emailVerified: !!user.emailVerified,
    };
  }

  async updateUser(id: string, email?: string, password?: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (email) {
      const newEmail = String(email).trim().toLowerCase();
      if (!newEmail.includes('@')) throw new BadRequestException('E-mail inválido.');

      const exists = await this.userRepo.findOne({ where: { email: newEmail } });
      if (exists && exists.id !== id) {
        throw new BadRequestException('Este e-mail já está em uso.');
      }

      // ⚠️ se mudar e-mail, volta a exigir verificação
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('base64url');
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      user.email = newEmail;
      user.emailVerified = false;
      user.emailVerifiedAt = null;
      user.emailVerifyTokenHash = tokenHash;
      user.emailVerifyTokenExpiresAt = expires;

      const apiUrl =
        (process.env.API_PUBLIC_URL || '').trim() ||
        'https://mestrekira-api.onrender.com';
      const verifyUrl = `${apiUrl}/mail/verify-email?token=${encodeURIComponent(token)}`;

      await this.mail.sendEmailVerification({
        to: newEmail,
        name: user.name,
        verifyUrl,
      });
    }

    if (password) {
      if (password.length < 8) {
        throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
      }
      user.password = password;
    }

    await this.userRepo.save(user);
    return { ok: true };
  }

  // ... (seu removeUser fica igual)
  async removeUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const role = normalizeRole(user.role);

    await this.dataSource.transaction(async (manager) => {
      if (role === 'student') {
        await manager.delete(EssayEntity, { studentId: id });
        await manager.delete(EnrollmentEntity, { studentId: id });
        await manager.delete(UserEntity, { id });
        return;
      }

      const rooms = await manager.find(RoomEntity, { where: { professorId: id } });
      const roomIds = rooms.map((r) => r.id);

      if (roomIds.length > 0) {
        const tasks = await manager.find(TaskEntity, { where: { roomId: In(roomIds) } });
        const taskIds = tasks.map((t) => t.id);

        if (taskIds.length > 0) {
          await manager
            .createQueryBuilder()
            .delete()
            .from(EssayEntity)
            .where('"taskId" IN (:...taskIds)', { taskIds })
            .execute();
        }

        await manager.delete(TaskEntity, { roomId: In(roomIds) });
        await manager.delete(EnrollmentEntity, { roomId: In(roomIds) });
        await manager.delete(RoomEntity, { id: In(roomIds) });
      }

      await manager.delete(UserEntity, { id });
    });

    return { ok: true };
  }
}
