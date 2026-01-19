import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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
    if (!name || !professorId) {
      throw new BadRequestException('Informe nome da sala e professorId.');
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const room = this.roomRepo.create({
      name,
      professorId,
      code,
    });

    return this.roomRepo.save(room);
  }

  async findByProfessor(professorId: string) {
    if (!professorId) throw new BadRequestException('professorId é obrigatório.');
    return this.roomRepo.find({ where: { professorId } });
  }

  async findAll() {
    return this.roomRepo.find();
  }

  async findById(id: string) {
    const room = await this.roomRepo.findOne({ where: { id } });
    if (!room) throw new NotFoundException('Sala não encontrada');
    return room;
  }

  async findByCode(code: string) {
    if (!code) throw new BadRequestException('code é obrigatório.');
    return this.roomRepo.findOne({ where: { code } });
  }

  // ✅ Lista alunos da sala com nome/email
  async findStudents(roomId: string) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const enrollments = await this.enrollmentRepo.find({ where: { roomId } });
    if (enrollments.length === 0) return []; // ✅ sem erro

    const studentIds = enrollments.map(e => e.studentId);

    const students = await this.userRepo.find({
      where: { id: In(studentIds) },
    });

    return students.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
    }));
  }

  // ✅ Remover aluno da sala (professor)
  async removeStudent(roomId: string, studentId: string) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId, studentId },
    });

    if (!enrollment) {
      // não é erro “grave”; apenas informa
      return { ok: true, removed: false };
    }

    await this.enrollmentRepo.delete({ roomId, studentId });
    return { ok: true, removed: true };
  }

  // ✅ Overview (ajuda aluno ver professor + colegas)
  async overview(roomId: string) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const professor = await this.userRepo.findOne({
      where: { id: room.professorId },
    });

    const students = await this.findStudents(roomId);

    return {
      room: { id: room.id, name: room.name, code: room.code },
      professor: professor
        ? { id: professor.id, name: professor.name, email: professor.email }
        : null,
      students,
    };
  }

  // ✅ Versão leve: sala + professor (bom pro painel-aluno)
  async withProfessor(roomId: string) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
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

  // ✅ EXCLUSÃO COMPLETA: apaga redações -> tarefas -> matrículas -> sala
  async remove(id: string) {
    const room = await this.roomRepo.findOne({ where: { id } });
    if (!room) throw new NotFoundException('Sala não encontrada');

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
