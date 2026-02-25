import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TaskEntity } from './task.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { EssayEntity } from '../essays/essay.entity';
import { RoomEntity } from '../rooms/room.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,

    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,

    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>, // ✅ index [3] do erro
  ) {}

  async create(roomId: string, title: string, guidelines?: string) {
    const r = String(roomId || '').trim();
    const t = String(title || '').trim();

    if (!r || !t) throw new BadRequestException('roomId e title são obrigatórios.');

    // (opcional, mas recomendado) valida sala existe
    const room = await this.roomRepo.findOne({ where: { id: r } });
    if (!room) throw new NotFoundException('Sala não encontrada.');

    const task = this.taskRepo.create({ roomId: r, title: t, guidelines: guidelines ?? '' });
    return this.taskRepo.save(task);
  }

  async findByRoom(roomId: string) {
    const r = String(roomId || '').trim();
    if (!r) throw new BadRequestException('roomId é obrigatório.');
    return this.taskRepo.find({ where: { roomId: r } });
  }

  async findById(id: string) {
    const tid = String(id || '').trim();
    if (!tid) throw new BadRequestException('id é obrigatório.');
    return this.taskRepo.findOne({ where: { id: tid } });
  }

  async findByRoomForStudent(roomId: string, studentId: string) {
    const r = String(roomId || '').trim();
    const s = String(studentId || '').trim();
    if (!r || !s) throw new BadRequestException('roomId e studentId são obrigatórios.');

    const enrollment = await this.enrollmentRepo.findOne({ where: { roomId: r, studentId: s } });
    if (!enrollment) throw new BadRequestException('Aluno não matriculado na sala');

    return this.taskRepo.find({ where: { roomId: r } });
  }

  // ✅ EXCLUSÃO COMPLETA DA TAREFA: apaga redações -> tarefa
  async remove(id: string) {
    const tid = String(id || '').trim();
    if (!tid) throw new BadRequestException('id é obrigatório.');

    await this.essayRepo.delete({ taskId: tid });
    await this.taskRepo.delete(tid);
    return { ok: true };
  }

  /**
   * ✅ usado pelo PDF (wrapper)
   * - ordena por createdAt se existir
   */
  async byRoom(roomId: string) {
    const r = String(roomId || '').trim();
    if (!r) return [];

    return this.taskRepo.find({
      where: { roomId: r },
      order: { createdAt: 'DESC' as any },
    });
  }
}
