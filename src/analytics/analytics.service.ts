import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { TaskEntity } from '../tasks/task.entity';
import { EssayEntity } from '../essays/essay.entity';
import { UserEntity } from '../users/user.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,

    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async roomEssays(roomId: string, studentId?: string) {
    const tasks = await this.taskRepo.find({ where: { roomId } });
    if (tasks.length === 0) return [];

    const taskIds = tasks.map(t => t.id);

    const where: any = { taskId: In(taskIds) };
    if (studentId) where.studentId = studentId;

    const essays = await this.essayRepo.find({ where });

    if (essays.length === 0) return [];

    // professor pode ver nomes
    const studentIds = Array.from(new Set(essays.map(e => e.studentId)));
    const students = await this.userRepo.find({ where: { id: In(studentIds) } });
    const map = new Map(students.map(s => [s.id, s]));

    return essays.map(e => {
      const s = map.get(e.studentId);
      return {
        id: e.id,
        taskId: e.taskId,
        studentId: e.studentId,
        studentName: s?.name ?? '',
        studentEmail: s?.email ?? '',
        c1: e.c1 ?? 0,
        c2: e.c2 ?? 0,
        c3: e.c3 ?? 0,
        c4: e.c4 ?? 0,
        c5: e.c5 ?? 0,
        score: e.score ?? 0,
        total: e.score ?? 0,
      };
    });
  }
}
