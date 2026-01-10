import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskEntity } from './task.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,
  ) {}

  async create(roomId: string, title: string, guidelines?: string) {
    const task = this.taskRepo.create({
      roomId,
      title,
      guidelines,
    });

    return this.taskRepo.save(task);
  }

  async findByRoom(roomId: string) {
    return this.taskRepo.find({
      where: { roomId },
      order: { id: 'DESC' },
    });
  }

  async findById(id: string) {
    return this.taskRepo.findOne({ where: { id } });
  }
}
