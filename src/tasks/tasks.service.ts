import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
    private readonly roomRepo: Repository<RoomEntity>,
  ) {}

  private normId(v: any) {
    const s = String(v || '').trim();
    return s && s !== 'undefined' && s !== 'null' ? s : '';
  }

  private async ensureRoom(roomId: string) {
    const rid = this.normId(roomId);
    if (!rid) throw new BadRequestException('roomId é obrigatório.');
    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada.');
    return room;
  }

  private async ensureTask(taskId: string) {
    const tid = this.normId(taskId);
    if (!tid) throw new BadRequestException('taskId/id é obrigatório.');
    const task = await this.taskRepo.findOne({ where: { id: tid } });
    if (!task) throw new NotFoundException('Tarefa não encontrada.');
    return task;
  }

  /**
   * ✅ Criar tarefa (professor)
   * - garante que a sala pertence ao professor
   */
  async create(roomId: string, title: string, guidelines: string | undefined, professorId?: string) {
    const rid = this.normId(roomId);
    const t = String(title || '').trim();
    const g = guidelines ?? '';

    if (!rid || !t) throw new BadRequestException('roomId e title são obrigatórios.');

    const room = await this.ensureRoom(rid);

    // ownership (se professorId informado)
    const pid = this.normId(professorId);
    if (pid && String(room.professorId) !== pid) {
      throw new ForbiddenException('Você não tem permissão para criar tarefa nesta sala.');
    }

    const task = this.taskRepo.create({ roomId: rid, title: t, guidelines: g });
    return this.taskRepo.save(task);
  }

  /**
   * ✅ Listar tarefas por sala (professor)
   * - se professorId vier, valida ownership
   */
  async findByRoom(roomId: string, professorId?: string) {
    const rid = this.normId(roomId);
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.ensureRoom(rid);

    const pid = this.normId(professorId);
    if (pid && String(room.professorId) !== pid) {
      throw new ForbiddenException('Você não tem permissão para ver tarefas desta sala.');
    }

    return this.taskRepo.find({
      where: { roomId: rid },
      order: { createdAt: 'DESC' as any, id: 'ASC' as any },
    });
  }

  /**
   * ✅ Buscar tarefa por id (professor)
   * - valida ownership via sala da tarefa
   */
  async findById(id: string, professorId?: string) {
    const task = await this.ensureTask(id);

    const pid = this.normId(professorId);
    if (pid) {
      const room = await this.ensureRoom(task.roomId);
      if (String(room.professorId) !== pid) {
        throw new ForbiddenException('Você não tem permissão para ver esta tarefa.');
      }
    }

    return task;
  }

  /**
   * ✅ Listar tarefas por sala para aluno
   * - exige matrícula
   */
  async findByRoomForStudent(roomId: string, studentId: string) {
    const rid = this.normId(roomId);
    const sid = this.normId(studentId);
    if (!rid || !sid) throw new BadRequestException('roomId e studentId são obrigatórios.');

    await this.ensureRoom(rid);

    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId: rid, studentId: sid },
    });
    if (!enrollment) throw new ForbiddenException('Aluno não matriculado na sala.');

    return this.taskRepo.find({
      where: { roomId: rid },
      order: { createdAt: 'DESC' as any, id: 'ASC' as any },
    });
  }

  /**
   * ✅ Excluir tarefa (professor)
   * - valida ownership via sala da tarefa
   * - apaga redações -> tarefa
   */
  async remove(id: string, professorId?: string) {
    const task = await this.ensureTask(id);

    const pid = this.normId(professorId);
    if (pid) {
      const room = await this.ensureRoom(task.roomId);
      if (String(room.professorId) !== pid) {
        throw new ForbiddenException('Você não tem permissão para excluir esta tarefa.');
      }
    }

    await this.essayRepo.delete({ taskId: task.id });
    await this.taskRepo.delete(task.id);
    return { ok: true };
  }

  /**
   * ✅ usado pelo PDF (wrapper)
   */
  async byRoom(roomId: string) {
    const rid = this.normId(roomId);
    if (!rid) return [];
    return this.taskRepo.find({
      where: { roomId: rid },
      order: { createdAt: 'DESC' as any, id: 'ASC' as any },
    });
  }
}
