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

 async correctEnem(id: string, feedback: string, c1: number, c2: number, c3: number, c4: number, c5: number) {
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

  // ✅ usado pelo professor (retorna studentName/studentEmail junto)
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
        studentId: e.studentId,
        studentName: s?.name ?? '(aluno não encontrado)',
        studentEmail: s?.email ?? '',
      };
    });
  }

  async findOne(id: string) {
    return this.essayRepo.findOne({ where: { id } });
  }
}

