import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EssayEntity } from './essay.entity';
import { UserEntity } from '../users/user.entity';

@Injectable()
export class EssaysService {
  constructor(
    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
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
    const score = Number(c1) + Number(c2) + Number(c3) + Number(c4) + Number(c5);

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
    const students = await this.userRepo.find({ where: { id: In(studentIds) } });

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

  // ✅ Para o professor: desempenho por sala (roomId)
async performanceByRoom(roomId: string) {
  // pega todas as tarefas da sala, via essays -> taskId (sem precisar do tasksRepo)
  // mas precisamos mapear quais taskIds pertencem à sala.
  // Então: buscamos tasks via query manual (mais simples é ter taskRepo).
  // Como você NÃO injetou taskRepo aqui, vamos fazer o caminho "correto":
  throw new Error('performanceByRoom requer acesso às tarefas (TaskEntity). Injete TaskRepo no EssaysService.');
}

}

