import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomEntity } from './room.entity';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,
  ) {}

  async create(name: string, professorId: string) {
    const code = 'KIRA-' + Math.random().toString(36).substring(2, 7).toUpperCase();

    const room = this.roomRepo.create({
      name,
      professorId,
      code,
    });

    return this.roomRepo.save(room);
  }

  async findByProfessor(professorId: string) {
    return this.roomRepo.find({ where: { professorId } });
  }

  async findById(id: string) {
    return this.roomRepo.findOne({ where: { id } });
  }
}
