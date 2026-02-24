import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { RoomEntity } from './room.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EssayEntity } from '../essays/essay.entity';
import { UserEntity } from '../users/user.entity';

@Injectable()
export class RoomsService {
  private readonly LIMIT_MAX_ROOMS_PROFESSOR = 10;

  constructor(
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,

    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,

    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,

    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  private async generateUniqueRoomCode(maxAttempts = 12) {
    for (let i = 0; i < maxAttempts; i++) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const exists = await this.roomRepo.findOne({ where: { code } });
      if (!exists) return code;
    }
    throw new BadRequestException('Não foi possível gerar um código único.');
  }

  /**
   * Criação de sala pelo PROFESSOR (rota /rooms)
   * - professor individual: limite 10 salas
   * - professor gerenciado pela escola: bloqueado (cria sala pelo painel da escola)
   */
  async create(name: string, professorId: string) {
    const n = (name || '').trim();
    const p = (professorId || '').trim();

    if (!n || !p) {
      throw new BadRequestException('Informe name e professorId.');
    }

    const professor = await this.userRepo.findOne({ where: { id: p } });
    if (!professor) throw new NotFoundException('Professor não encontrado.');

    const role = String(professor.role || '').toLowerCase();
    if (role !== 'professor') {
      throw new ForbiddenException('Apenas professores podem criar salas.');
    }

    const pType = String(professor.professorType || 'INDIVIDUAL').toUpperCase();
    if (pType === 'SCHOOL') {
      throw new ForbiddenException(
        'Professor cadastrado pela escola não pode criar salas por aqui.',
      );
    }

    // limite 10 salas por professor individual
    const count = await this.roomRepo.count({ where: { professorId: p } });
    if (count >= this.LIMIT_MAX_ROOMS_PROFESSOR) {
      throw new BadRequestException(
        `Limite atingido: no máximo ${this.LIMIT_MAX_ROOMS_PROFESSOR} salas.`,
      );
    }

    const code = await this.generateUniqueRoomCode();

    const room: RoomEntity = this.roomRepo.create({
      name: n,
      professorId: p,
      code,
      ownerType: 'PROFESSOR',
      schoolId: null,
      teacherId: null,
      teacherNameSnapshot: null,
    });

    return this.roomRepo.save(room);
  }

  async findByProfessor(professorId: string) {
    const p = (professorId || '').trim();
    if (!p) throw new BadRequestException('professorId é obrigatório.');
    return this.roomRepo.find({ where: { professorId: p } });
  }

  async findAll() {
    return this.roomRepo.find();
  }

  async findById(id: string) {
    const rid = (id || '').trim();
    if (!rid) throw new BadRequestException('id é obrigatório.');
    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');
    return room;
  }

  async findByCode(code: string) {
    const c = (code || '').trim().toUpperCase();
    if (!c) throw new BadRequestException('code é obrigatório.');
    return this.roomRepo.findOne({ where: { code: c } });
  }

  async findStudents(roomId: string) {
    const rid = (roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const enrollments = await this.enrollmentRepo.find({
      where: { roomId: rid },
    });
    if (enrollments.length === 0) return [];

    const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));

    const students = await this.userRepo.find({
      where: { id: In(studentIds) },
    });

    const map = new Map(students.map((s) => [s.id, s]));

    return enrollments.map((e) => {
      const s = map.get(e.studentId);
      return {
        id: e.studentId,
        name: s?.name ?? '(aluno)',
        email: s?.email ?? '',
      };
    });
  }

  async removeStudent(roomId: string, studentId: string) {
    const rid = (roomId || '').trim();
    const sid = (studentId || '').trim();

    if (!rid || !sid) {
      throw new BadRequestException('roomId e studentId são obrigatórios.');
    }

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId: rid, studentId: sid },
    });

    if (!enrollment) {
      return { ok: true, removed: false };
    }

    const tasks = await this.taskRepo.find({ where: { roomId: rid } });
    const taskIds = tasks.map((t) => t.id);

    if (taskIds.length > 0) {
      await this.essayRepo
        .createQueryBuilder()
        .delete()
        .from(EssayEntity)
        .where('"studentId" = :sid', { sid })
        .andWhere('"taskId" IN (:...taskIds)', { taskIds })
        .execute();
    }

    await this.enrollmentRepo.delete({ roomId: rid, studentId: sid });
    return { ok: true, removed: true };
  }

  async overview(roomId: string) {
    const rid = (roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const professor = await this.userRepo.findOne({
      where: { id: room.professorId },
    });

    const students = await this.findStudents(rid);

    return {
      room: { id: room.id, name: room.name, code: room.code },
      professor: professor
        ? { id: professor.id, name: professor.name, email: professor.email }
        : null,
      students,
    };
  }

  async withProfessor(roomId: string) {
    const rid = (roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const professor = await this.userRepo.findOne({
      where: { id: room.professorId },
    });

    return {
      room: { id: room.id, name: room.name, code: room.code },
      professor: professor
        ? { id: professor.id, name: professor.name, email: professor.email }
        : null,
    };
  }

  async remove(id: string) {
    const rid = (id || '').trim();
    if (!rid) throw new BadRequestException('id é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const tasks = await this.taskRepo.find({ where: { roomId: rid } });
    const taskIds = tasks.map((t) => t.id);

    if (taskIds.length > 0) {
      await this.essayRepo
        .createQueryBuilder()
        .delete()
        .from(EssayEntity)
        .where('"taskId" IN (:...taskIds)', { taskIds })
        .execute();
    }

    await this.taskRepo.delete({ roomId: rid });
    await this.enrollmentRepo.delete({ roomId: rid });
    await this.roomRepo.delete(rid);

    return { ok: true };
  }
}
