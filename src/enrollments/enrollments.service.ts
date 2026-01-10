import { Injectable } from '@nestjs/common';
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

  async enroll(roomId: string, studentId: string) {
    const exists = await this.enrollmentRepo.findOne({
      where: { roomId, studentId },
    });

    if (exists) return exists;

    const enrollment = this.enrollmentRepo.create({ roomId, studentId });
    return this.enrollmentRepo.save(enrollment);
  }

  // 🔹 ENTRADA POR CÓDIGO (ESTAVA FALTANDO)
  async joinByCode(code: string, studentId: string) {
    const room = await this.roomRepo.findOne({
      where: { code },
    });

    if (!room) {
      throw new Error('Sala não encontrada');
    }

    return this.enroll(room.id, studentId);
  }

  async findStudentsByRoom(roomId: string) {
    return this.enrollmentRepo.find({
      where: { roomId },
    });
  }
}
