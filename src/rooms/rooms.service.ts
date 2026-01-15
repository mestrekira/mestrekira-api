import { Injectable } from '@nestjs/common';
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
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const room = this.roomRepo.create({
      name,
      professorId,
      code,
    });

    return this.roomRepo.save(room);
  }

  async findByProfessor(professorId: string) {
    return this.roomRepo.find({ where: { professorId } });
  }

  async findAll() {
    return this.roomRepo.find();
  }

  async findById(id: string) {
    return this.roomRepo.findOne({ where: { id } });
  }

  async findByCode(code: string) {
    return this.roomRepo.findOne({ where: { code } });
  }

  // ✅ NOVO: lista alunos da sala com nome/email
  async findStudents(roomId: string) {
    const enrollments = await this.enrollmentRepo.find({ where: { roomId } });
    if (enrollments.length === 0) return [];

    const studentIds = enrollments.map(e => e.studentId);

    const students = await this.userRepo.find({
      where: { id: In(studentIds) },
    });

    // retorna enxuto (sem passwordHash)
    return students.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
    }));
  }

  // ✅ NOVO: overview (ajuda aluno ver professor + colegas)
  async overview(roomId: string) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new Error('Sala não encontrada');

    const professor = await this.userRepo.findOne({ where: { id: room.professorId } });

    const students = await this.findStudents(roomId);

    return {
      room: { id: room.id, name: room.name, code: room.code },
      professor: professor
        ? { id: professor.id, name: professor.name, email: professor.email }
        : null,
      students,
    };
  }

  // ✅ EXCLUSÃO COMPLETA: apaga redações -> tarefas -> matrículas -> sala
  async remove(id: string) {
    const tasks = await this.taskRepo.find({ where: { roomId: id } });
    const taskIds = tasks.map(t => t.id);

    for (const taskId of taskIds) {
      await this.essayRepo.delete({ taskId });
    }

    await this.taskRepo.delete({ roomId: id });
    await this.enrollmentRepo.delete({ roomId: id });
    await this.roomRepo.delete(id);

    return { ok: true };
  }
}
