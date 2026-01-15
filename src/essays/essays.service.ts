import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { EssayEntity } from './essay.entity';
import { UserEntity } from '../users/user.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';

@Injectable()
export class EssaysService {
  constructor(
    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,

    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,
  ) {}

  async create(taskId: string, studentId: string, content: string) {
    const essay = this.essayRepo.create({ taskId, studentId, content });
    return this.essayRepo.save(essay);
  }

  async correctEnem(
    id: string,
    feedback: string,
    c1: number,
    c2: number,
    c3: number,
    c4: number,
    c5: number,
  ) {
    const score = c1 + c2 + c3 + c4 + c5;

    await this.essayRepo.update(id, {
      feedback,
      c1,
      c2,
      c3,
      c4,
      c5,
      score,
    });

    return this.essayRepo.findOne({ where: { id } });
  }

  async findByTask(taskId: string) {
    return this.essayRepo.find({ where: { taskId } });
  }

  // ✅ usado pelo professor (retorna studentName/studentEmail + ENEM)
  async findByTaskWithStudent(taskId: string) {
    const essays = await this.essayRepo.find({ where: { taskId } });
    if (essays.length === 0) return [];

    const studentIds = Array.from(new Set(essays.map(e => e.studentId)));
    const students = await this.userRepo.find({ where: { id: In(studentIds) } });

    const map = new Map(students.map(s => [s.id, s]));

    return essays.map(e => {
      const s = map.get(e.studentId);
      return {
        id: e.id,
        content: e.content,
        feedback: e.feedback ?? null,
        score: e.score ?? null,

        // ✅ ENEM (para reabrir correção preenchida)
        c1: e.c1 ?? null,
        c2: e.c2 ?? null,
        c3: e.c3 ?? null,
        c4: e.c4 ?? null,
        c5: e.c5 ?? null,

        studentId: e.studentId,
        studentName: s?.name ?? '(aluno não encontrado)',
        studentEmail: s?.email ?? '',
      };
    });
  }

  async findOne(id: string) {
    return this.essayRepo.findOne({ where: { id } });
  }

  // =========================================================
  // ✅ DESEMPENHO POR SALA
  // =========================================================

  // ✅ PROFESSOR: todas as redações da sala + aluno + tarefa
  async performanceByRoom(roomId: string) {
    const tasks = await this.taskRepo.find({ where: { roomId } });
    if (tasks.length === 0) return [];

    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const taskIds = tasks.map(t => t.id);

    const essays = await this.essayRepo.find({
      where: { taskId: In(taskIds) },
    });

    if (essays.length === 0) return [];

    const studentIds = Array.from(new Set(essays.map(e => e.studentId)));
    const students = await this.userRepo.find({ where: { id: In(studentIds) } });
    const studentMap = new Map(students.map(s => [s.id, s]));

    return essays.map(e => {
      const s = studentMap.get(e.studentId);
      const t = taskMap.get(e.taskId);

      return {
        id: e.id,
        taskId: e.taskId,
        taskTitle: t?.title ?? '(tarefa não encontrada)',
        taskGuidelines: t?.guidelines ?? null,

        studentId: e.studentId,
        studentName: s?.name ?? '(aluno não encontrado)',
        studentEmail: s?.email ?? '',

        score: e.score ?? null,
        c1: e.c1 ?? null,
        c2: e.c2 ?? null,
        c3: e.c3 ?? null,
        c4: e.c4 ?? null,
        c5: e.c5 ?? null,
        feedback: e.feedback ?? null,
      };
    });
  }

  // ✅ ALUNO: desempenho na sala (valida matrícula) só do próprio aluno
  async performanceByRoomForStudent(roomId: string, studentId: string) {
    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId, studentId },
    });

    if (!enrollment) {
      throw new Error('Aluno não matriculado na sala');
    }

    const tasks = await this.taskRepo.find({ where: { roomId } });
    if (tasks.length === 0) return [];

    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const taskIds = tasks.map(t => t.id);

    const essays = await this.essayRepo.find({
      where: { taskId: In(taskIds), studentId },
    });

    return essays.map(e => {
      const t = taskMap.get(e.taskId);
      return {
        id: e.id,
        taskId: e.taskId,
        taskTitle: t?.title ?? '(tarefa não encontrada)',
        taskGuidelines: t?.guidelines ?? null,

        score: e.score ?? null,
        c1: e.c1 ?? null,
        c2: e.c2 ?? null,
        c3: e.c3 ?? null,
        c4: e.c4 ?? null,
        c5: e.c5 ?? null,
        feedback: e.feedback ?? null,
      };
    });
  }
}
