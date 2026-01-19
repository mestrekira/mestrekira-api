import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EnrollmentEntity } from './enrollment.entity';
import { RoomEntity } from '../rooms/room.entity';
import { UserEntity } from '../users/user.entity';

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,

    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async enroll(roomId: string, studentId: string) {
    if (!roomId || !studentId) {
      throw new BadRequestException('roomId e studentId são obrigatórios');
    }

    const exists = await this.enrollmentRepo.findOne({
      where: { roomId, studentId },
    });

    if (exists) return exists;

    const enrollment = this.enrollmentRepo.create({ roomId, studentId });
    return this.enrollmentRepo.save(enrollment);
  }

  // 🔹 ENTRADA POR CÓDIGO
  async joinByCode
