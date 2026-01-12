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

  async saveDraft(roomId: string, userId: string, text: string) {
    let essay = await this.essayRepo.findOne({
      where: {
        roomId,
        userId,
        status: 'DRAFT',
      },
    });

    if (essay) {
      essay.content = text;
    } else {
      essay = this.essayRepo.create({
        roomId,
        userId,
        content: text,
        status: 'DRAFT',
      });
    }

    return this.essayRepo.save(essay);
  }

  async submit(roomId: string, userId: string, text: string) {
    const essay = this.essayRepo.create({
      roomId,
      userId,
      content: text,
      status: 'SUBMITTED',
    });

    const saved = await this.essayRepo.save(essay);

    return {
      essayId: saved.id,
    };
  }

  async correct(id: string, feedback: string, score: number) {
    await this.essayRepo.update(id, {
      feedback,
      score,
      status: 'CORRECTED',
    });

    return this.essayRepo.findOne({ where: { id } });
  }

  async findByRoom(roomId: string) {
    return this.essayRepo.find({
      where: { roomId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByStudent(userId: string) {
    return this.essayRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(taskId: string, studentId: string, content: string) {
  const essay = this.essayRepo.create({
    taskId,
    studentId,
    content,
  });

  return this.essayRepo.save(essay);
}

async findByTask(taskId: string) {
  return this.essayRepo.find({ where: { taskId } });
}

}

