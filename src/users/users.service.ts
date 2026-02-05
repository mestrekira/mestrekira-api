import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { UserEntity } from './user.entity';
import { EssayEntity } from '../essays/essay.entity';
import { RoomEntity } from '../rooms/room.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { TaskEntity } from '../tasks/task.entity';

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
  ) {}

  async createProfessor(name: string, email: string, password: string) {
    email = String(email || '').trim().toLowerCase();

    if (!email.includes('@')) throw new BadRequestException('E-mail inválido.');
    if (!password || password.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new BadRequestException('Este e-mail já está cadastrado.');

    const user = this.userRepo.create({
      name,
      email,
      password,
      role: 'professor',
    });

    return this.userRepo.save(user);
  }

  async createStudent(name: string, email: string, password: string) {
    email = String(email || '').trim().toLowerCase();

    if (!email.includes('@')) throw new BadRequestException('E-mail inválido.');
    if (!password || password.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new BadRequestException('Este e-mail já está cadastrado.');

    const user = this.userRepo.create({
      name,
      email,
      password,
      role: 'student',
    });

    return this.userRepo.save(user);
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
      user.email = newEmail;
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

  /**
   * ✅ Exclusão "limpa" com transação (libera armazenamento)
   * - student: apaga redações + matrículas e depois o usuário
   * - professor: apaga salas do professor e tudo abaixo (tarefas, redações, matrículas) e depois o usuário
   */
  async removeUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const role = normalizeRole(user.role);

    await this.dataSource.transaction(async (manager) => {
      if (role === 'student') {
        // 1) apaga redações do aluno
        await manager.delete(EssayEntity, { studentId: id });

        // 2) apaga matrículas do aluno
        await manager.delete(EnrollmentEntity, { studentId: id });

        // 3) apaga usuário
        await manager.delete(UserEntity, { id });

        return;
      }

      // role === 'professor'
      // 1) pega salas do professor
      const rooms = await manager.find(RoomEntity, { where: { professorId: id } });
      const roomIds = rooms.map((r) => r.id);

      if (roomIds.length > 0) {
        // 2) pega tarefas dessas salas
        const tasks = await manager.find(TaskEntity, { where: { roomId: In(roomIds) } });
        const taskIds = tasks.map((t) => t.id);

        // 3) apaga redações das tarefas
        if (taskIds.length > 0) {
          await manager
            .createQueryBuilder()
            .delete()
            .from(EssayEntity)
            .where('"taskId" IN (:...taskIds)', { taskIds })
            .execute();
        }

        // 4) apaga tarefas
        await manager.delete(TaskEntity, { roomId: In(roomIds) });

        // 5) apaga matrículas dessas salas
        await manager.delete(EnrollmentEntity, { roomId: In(roomIds) });

        // 6) apaga salas
        await manager.delete(RoomEntity, { id: In(roomIds) });
      }

      // 7) apaga usuário professor
      await manager.delete(UserEntity, { id });
    });

    return { ok: true };
  }
}
