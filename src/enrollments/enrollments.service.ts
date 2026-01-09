import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnrollmentEntity } from './enrollment.entity';
import { RoomEntity } from '../rooms/room.entity';

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,

    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,
  ) {}

  async joinByCode(code: string, studentId: string) {
   
    const room = await this.roomRepo.findOne({ where: { code } });

    if (!room) {
      throw new NotFoundException('Sala não encontrada');
    }

    const alreadyEnrolled = await this.enrollmentRepo.findOne({
      where: { roomId: room.id, studentId },
    });

    if (alreadyEnrolled) {
      return room;
    }

    const enrollment = this.enrollmentRepo.create({
      roomId: room.id,
      studentId,
    });

    await this.enrollmentRepo.save(enrollment);

    return room;
  }
}
