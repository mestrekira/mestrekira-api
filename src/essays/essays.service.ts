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

  async create(roomId: string, studentId: string, content: string) {
    const essay = this.essayRepo.create({
      roomId,
      studentId,
      content,
    });

    return this.essayRepo.save(essay);
  }

  async correct(id: string, feedback: string, score: number) {
    await this.essayRepo.update(id, { feedback, score });
    return this.essayRepo.findOne({ where: { id } });
  }

  async findByRoom(roomId: string) {
    return this.essayRepo.find({ where: { roomId } });
  }

  async findByStudent(studentId: string) {
    return this.essayRepo.find({ where: { studentId } });
  }
}
