import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskEntity } from './task.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { EssayEntity } from '../essays/essay.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,

    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,

    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,
  ) {}

  async create(roomId: string, title: string, guidelines?: string) {
    const task = this.taskRepo.create({ roomId, title, guidelines });
    return this.taskRepo.save(task);
  }

  async findByRoom(roomId: string) {
    return this.taskRepo.find({ where: { roomId } });
  }

  async findById(id: string) {
    return this.taskRepo.findOne({ where: { id } });
  }

  async findByRoomForStudent(roomId: string, studentId: string) {
    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId, studentId },
    });

    if (!enrollment) throw new Error('Aluno não matriculado na sala');

    return this.taskRepo.find({ where: { roomId } });
  }

  // ✅ EXCLUSÃO COMPLETA DA TAREFA: apaga redações -> tarefa
  async remove(id: string) {
    await this.essayRepo.delete({ taskId: id });
    await this.taskRepo.delete(id);
    return { ok: true };
  }

  /**
   * ✅ usado pelo PDF (wrapper)
   * - mantém compatibilidade com o controller do PDF
   * - ordena por createdAt se o TaskEntity tiver esse campo
   */
  async byRoom(roomId: string) {
    if (!roomId) return [];

    // se seu TaskEntity tiver createdAt, ordena desc; se não tiver, não força order
    // (TypeORM não valida em compile-time, mas isso evita você depender do campo)
    try {
      return await this.taskRepo.find({
        where: { roomId },
        order: { createdAt: 'DESC' } as any,
      });
    } catch {
      return this.taskRepo.find({ where: { roomId } });
    }
  }
}
