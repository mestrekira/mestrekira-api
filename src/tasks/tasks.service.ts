import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskEntity } from './task.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,

    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,
  ) {}

  // 🔹 Criar tarefa (professor)
  async create(roomId: string, title: string, guidelines?: string) {
    const task = this.taskRepo.create({
      roomId,
      title,
      guidelines,
    });

    return this.taskRepo.save(task);
  }

  // 🔹 Listar tarefas da sala (professor)
  async findByRoom(roomId: string) {
    return this.taskRepo.find({
      where: { roomId },
    });
  }

  // 🔹 Buscar tarefa por ID
  async findById(id: string) {
    return this.taskRepo.findOne({
      where: { id },
    });
  }

  // 🔹 ENDPOINT 2 — Listar tarefas para aluno (com validação)
  async findByRoomForStudent(roomId: string, studentId: string) {
    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId, studentId },
    });

    if (!enrollment) {
      throw new Error('Aluno não matriculado na sala');
    }

    return this.taskRepo.find({
      where: { roomId },
    });
  }

  async remove(id: string) {
  await this.taskRepo.delete(id);
  return { ok: true };
}

}

