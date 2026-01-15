import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RoomEntity } from './room.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EssayEntity } from '../essays/essay.entity';

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

  // ✅ EXCLUSÃO COMPLETA: apaga redações -> tarefas -> matrículas -> sala
  async remove(id: string) {
    // tarefas da sala
    const tasks = await this.taskRepo.find({ where: { roomId: id } });
    const taskIds = tasks.map(t => t.id);

    // redações das tarefas
    for (const taskId of taskIds) {
      await this.essayRepo.delete({ taskId });
    }

    // tarefas
    await this.taskRepo.delete({ roomId: id });

    // matrículas
    await this.enrollmentRepo.delete({ roomId: id });

    // sala
    await this.roomRepo.delete(id);

    return { ok: true };
  }
}
