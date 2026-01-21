import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EssayEntity } from './essay.entity';
import { UserEntity } from '../users/user.entity';
import { TaskEntity } from '../tasks/task.entity';

@Injectable()
export class EssaysService {
  constructor(
    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,
  ) {}

  async create(taskId: string, studentId: string, content: string) {
    const essay = this.essayRepo.create({
      taskId,
      studentId,
      content,
    });

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
    const score =
      Number(c1) + Number(c2) + Number(c3) + Number(c4) + Number(c5);

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

  // ✅ professor: redações + dados do aluno
  async findByTaskWithStudent(taskId: string) {
    const essays = await this.essayRepo.find({ where: { taskId } });
    if (essays.length === 0) return [];

    const studentIds = Array.from(new Set(essays.map((e) => e.studentId)));
    const students = await this.userRepo.find({
      where: { id: In(studentIds) },
    });

    const map = new Map(students.map((s) => [s.id, s]));

    return essays.map((e) => {
      const s = map.get(e.studentId);

      return {
        id: e.id,
        taskId: e.taskId,
        studentId: e.studentId,

        content: e.content,

        feedback: e.feedback ?? null,

        c1: e.c1 ?? null,
        c2: e.c2 ?? null,
        c3: e.c3 ?? null,
        c4: e.c4 ?? null,
        c5: e.c5 ?? null,
        score: e.score ?? null,

        studentName: s?.name ?? '(aluno não encontrado)',
        studentEmail: s?.email ?? '',
      };
    });
  }

  async findOne(id: string) {
    return this.essayRepo.findOne({ where: { id } });
  }

  // ✅ professor: uma redação + dados do aluno
  async findOneWithStudent(id: string) {
    const essay = await this.essayRepo.findOne({ where: { id } });
    if (!essay) return null;

    const student = await this.userRepo.findOne({
      where: { id: essay.studentId },
    });

    return {
      ...essay,
      studentName: student?.name ?? '(aluno não encontrado)',
      studentEmail: student?.email ?? '',
    };
  }

  // ✅ professor: desempenho por sala (agrupado por aluno)
  async performanceByRoom(roomId: string) {
    const tasks = await this.taskRepo.find({ where: { roomId } });
    if (tasks.length === 0) return [];

    const taskIds = tasks.map((t) => t.id);

    const essays = await this.essayRepo.find({
      where: { taskId: In(taskIds) },
    });

    if (essays.length === 0) return [];

    const studentIds = Array.from(new Set(essays.map((e) => e.studentId)));
    const students = await this.userRepo.find({
      where: { id: In(studentIds) },
    });
    const studentMap = new Map(students.map((s) => [s.id, s]));

    // agrupa por aluno
    const byStudent = new Map<string, EssayEntity[]>();
    for (const e of essays) {
      const key = e.studentId;
      if (!byStudent.has(key)) byStudent.set(key, []);
      byStudent.get(key)!.push(e);
    }

    return Array.from(byStudent.entries()).map(([studentId, list]) => {
      const s = studentMap.get(studentId);

      const corrected = list.filter(
        (x) => x.score !== null && x.score !== undefined,
      );

      const averageScore =
        corrected.length > 0
          ? Math.round(
              corrected.reduce((sum, x) => sum + (x.score ?? 0), 0) /
                corrected.length,
            )
          : null;

      return {
        studentId,
        studentName: s?.name ?? '(aluno não encontrado)',
        studentEmail: s?.email ?? '',
        totalEssays: list.length,
        correctedEssays: corrected.length,
        averageScore, // 0..1000

        essays: list.map((x) => ({
          id: x.id,
          taskId: x.taskId,
          score: x.score ?? null,
          c1: x.c1 ?? null,
          c2: x.c2 ?? null,
          c3: x.c3 ?? null,
          c4: x.c4 ?? null,
          c5: x.c5 ?? null,
        })),
      };
    });
  }

 // ✅ professor: desempenho por sala (LISTA PLANA de redações com aluno+tarefa)
async performanceByRoom(roomId: string) {
  const tasks = await this.taskRepo.find({ where: { roomId } });
  if (tasks.length === 0) return [];

  const taskIds = tasks.map((t) => t.id);

  const essays = await this.essayRepo.find({
    where: { taskId: In(taskIds) },
  });
  if (essays.length === 0) return [];

  // mapas auxiliares
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const studentIds = Array.from(new Set(essays.map((e) => e.studentId)));
  const students = await this.userRepo.find({
    where: { id: In(studentIds) },
  });
  const studentMap = new Map(students.map((s) => [s.id, s]));

  // ✅ retorno plano: 1 item por redação
  return essays.map((e) => {
    const t = taskMap.get(e.taskId);
    const s = studentMap.get(e.studentId);

    return {
      id: e.id,

      taskId: e.taskId,
      taskTitle: t?.title ?? '(tarefa)',

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
      content: e.content ?? '',
    };
  });
}

}

