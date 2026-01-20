import {
  Injectable,
  BadRequestException,
  NotFoundException,
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

  async create(name: string, professorId: string) {
    const n = (name || '').trim();
    const p = (professorId || '').trim();

    if (!n || !p) {
      throw new BadRequestException('Informe name e professorId.');
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const room = this.roomRepo.create({
      name: n,
      professorId: p,
      code,
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

  /**
   * ✅ Lista alunos matriculados (baseado nos enrollments)
   * - Nunca “some” aluno por falha no join do UserEntity
   * - Retorna fallback quando usuário não é encontrado
   */
  async findStudents(roomId: string) {
    const rid = (roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const enrollments = await this.enrollmentRepo.find({ where: { roomId: rid } });
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

    // apaga redações
    for (const taskId of taskIds) {
      await this.essayRepo.delete({ taskId });
    }

    // apaga tarefas, matrículas e sala
    await this.taskRepo.delete({ roomId: rid });
    await this.enrollmentRepo.delete({ roomId: rid });
    await this.roomRepo.delete(rid);

    return { ok: true };
  }
}
