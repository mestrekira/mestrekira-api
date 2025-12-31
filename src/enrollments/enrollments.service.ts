import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnrollmentEntity } from './enrollment.entity';

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,
  ) {}

  async enroll(studentId: string, roomId: string) {
    const enrollment = this.enrollmentRepo.create({
      studentId,
      roomId,
    });

    return this.enrollmentRepo.save(enrollment);
  }

  async findByRoom(roomId: string) {
    return this.enrollmentRepo.find({
      where: { roomId },
    });
  }

  async findByStudent(studentId: string) {
    return this.enrollmentRepo.find({
      where: { studentId },
    });
  }
}
