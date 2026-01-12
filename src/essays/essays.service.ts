import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EssayEntity } from './essay.entity';

@Injectable()
export class EssaysService {
  constructor(
    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,
  ) {}

  async create(taskId: string, studentId: string, content: string) {
    const essay = this.essayRepo.create({
      taskId,
      studentId,
      content,
    });

    return this.essayRepo.save(essay);
  }

  async correct(id: string, feedback: string, score: number) {
    await this.essayRepo.update(id, { feedback, score });
    return this.essayRepo.findOne({ where: { id } });
  }

  async findByTask(taskId: string) {
    return this.essayRepo.find({ where: { taskId } });
  }

  async findOne(id: string) {
    return this.essayRepo.findOne({ where: { id } });
  }
}
