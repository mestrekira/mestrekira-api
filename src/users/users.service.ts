import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { UserEntity } from './user.entity';
import { EssayEntity } from '../essays/essay.entity';
import { RoomEntity } from '../rooms/room.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { TaskEntity } from '../tasks/task.entity';

function normalizeRole(role: any): 'professor' | 'student' | 'school' {
  const r = String(role || '').trim().toLowerCase();

  // seus valores reais no banco (minúsculos)
  if (r === 'professor') return 'professor';
  if (r === 'student') return 'student';
  if (r === 'school' || r === 'escola') return 'school';

  // compat (se algum momento chegar uppercase)
  const up = String(role || '').trim().toUpperCase();
  if (up === 'PROFESSOR' || up === 'TEACHER') return 'professor';
  if (up === 'STUDENT' || up === 'ALUNO') return 'student';
  if (up === 'SCHOOL' || up === 'ESCOLA') return 'school';

  // fallback seguro
  return 'student';
}

function normalizeEmail(email: any) {
  return String(email || '').trim().toLowerCase();
}

function isBcryptHash(value: any) {
  const v = String(value || '');
  // bcrypt hashes começam com $2a$, $2b$, $2y$
  return v.startsWith('$2a$') || v.startsWith('$2b$') || v.startsWith('$2y$');
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
  ) {}

  // -----------------------------
  // Cadastro (NÃO envia email aqui)
  // -----------------------------
  async createProfessor(name: string, email: string, password: string) {
    email = normalizeEmail(email);

    if (!name?.trim()) throw new BadRequestException('Nome é obrigatório.');
    if (!email.includes('@')) throw new BadRequestException('E-mail inválido.');
    if (!password || password.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new BadRequestException('Este e-mail já está cadastrado.');

    // ✅ bcrypt no cadastro
    const passwordHash = await bcrypt.hash(String(password), 10);

    const user = this.userRepo.create({
      name,
      email,
      password: passwordHash,
      role: 'professor',

      // ✅ este ano: sem "mostra grátis" restritiva
      professorType: 'INDIVIDUAL',
      trialMode: false,
      mustChangePassword: false,
      schoolId: null,

      // verificação
      emailVerified: false,
      emailVerifiedAt: null,
      emailVerifyTokenHash: null,
      emailVerifyTokenExpiresAt: null,
    } as any);

    const saved = await this.userRepo.save(user);

    return {
      ok: true,
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: normalizeRole(saved.role),
      emailVerified: !!saved.emailVerified,

      // ✅ extras úteis no front
      professorType: (saved as any).professorType ?? null,
      mustChangePassword: !!(saved as any).mustChangePassword,
      schoolId: (saved as any).schoolId ?? null,
    };
  }

  async createStudent(name: string, email: string, password: string) {
    email = normalizeEmail(email);

    if (!name?.trim()) throw new BadRequestException('Nome é obrigatório.');
    if (!email.includes('@')) throw new BadRequestException('E-mail inválido.');
    if (!password || password.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new BadRequestException('Este e-mail já está cadastrado.');

    // ✅ bcrypt no cadastro
    const passwordHash = await bcrypt.hash(String(password), 10);

    const user = this.userRepo.create({
      name,
      email,
      password: passwordHash,
      role: 'student',

      // verificação
      emailVerified: false,
      emailVerifiedAt: null,
      emailVerifyTokenHash: null,
      emailVerifyTokenExpiresAt: null,
    });

    const saved = await this.userRepo.save(user);

    return {
      ok: true,
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: normalizeRole(saved.role),
      emailVerified: !!saved.emailVerified,
    };
  }

  // -----------------------------
  // Busca / Login
  // -----------------------------
  async findByEmail(email: string) {
    email = normalizeEmail(email);
    return this.userRepo.findOne({ where: { email } });
  }

  async findAll() {
    return this.userRepo.find();
  }

  /**
   * ✅ Validação com migração automática:
   * - Se senha no banco já for bcrypt → compare
   * - Se ainda for texto puro (legado) → compara direto e, se OK, converte para bcrypt e salva
   */
  async validateUser(email: string, password: string) {
    const user = await this.findByEmail(email);
    if (!user) return null;

    const incoming = String(password || '');
    const stored = String(user.password || '');

    // ✅ Já está em bcrypt
    if (isBcryptHash(stored)) {
      const ok = await bcrypt.compare(incoming, stored);
      if (!ok) return null;

      // ⚠️ mantém compat (alguns lugares podem esperar role normalizado)
      (user as any).role = normalizeRole(user.role);
      return user;
    }

    // ✅ Legado (texto puro)
    if (stored !== incoming) return null;

    // ✅ Migra para bcrypt ao logar com sucesso
    const newHash = await bcrypt.hash(incoming, 10);
    await this.userRepo.update({ id: user.id }, { password: newHash });
    user.password = newHash;

    (user as any).role = normalizeRole(user.role);
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

      // ✅ campos novos (não quebram ninguém e ajudam o front)
      professorType: (user as any).professorType ?? null,
      mustChangePassword: !!(user as any).mustChangePassword,
      schoolId: (user as any).schoolId ?? null,
      isActive: (user as any).isActive ?? true,
    };
  }

  async updateUser(id: string, email?: string, password?: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    let emailChanged = false;

    if (email) {
      const newEmail = normalizeEmail(email);
      if (!newEmail.includes('@')) throw new BadRequestException('E-mail inválido.');

      const exists = await this.userRepo.findOne({ where: { email: newEmail } });
      if (exists && exists.id !== id) {
        throw new BadRequestException('Este e-mail já está em uso.');
      }

      if (newEmail !== user.email) {
        user.email = newEmail;
        emailChanged = true;

        // se trocar e-mail, precisa verificar de novo:
        user.emailVerified = false;
        user.emailVerifiedAt = null;
        user.emailVerifyTokenHash = null;
        user.emailVerifyTokenExpiresAt = null;
      }
    }

    if (password) {
      const p = String(password || '');
      if (p.length < 8) {
        throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
      }

      // ✅ bcrypt ao atualizar senha
      user.password = await bcrypt.hash(p, 10);

      // ✅ se era professor gerenciado e estava forçando troca, limpa
      if ((user as any).mustChangePassword) {
        (user as any).mustChangePassword = false;
      }
    }

    await this.userRepo.save(user);

    // OBS: se emailChanged=true, quem deve disparar e-mail de verificação é o AuthService
    return { ok: true, emailChanged };
  }

  /**
   * ✅ Exclusão "limpa" com transação (libera armazenamento)
   */
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

      // professor ou school: remove salas vinculadas (se existirem)
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

  async removeUserWithPassword(id: string, password: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const stored = String(user.password || '');
    const incoming = String(password || '');

    const ok = isBcryptHash(stored)
      ? await bcrypt.compare(incoming, stored)
      : stored === incoming;

    if (!ok) throw new BadRequestException('Senha inválida para confirmar exclusão.');

    return this.removeUser(id);
  }
}
