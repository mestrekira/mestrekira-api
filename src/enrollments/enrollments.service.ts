import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnrollmentEntity } from './enrollment.entity';

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,
  ) {}

  async enroll(roomId: string, studentId: string) {
    const exists = await this.enrollmentRepo.findOne({
      where: { roomId, studentId },
    });

    if (exists) {
      throw new BadRequestException('Aluno já matriculado nesta sala');
    }

    const enrollment = this.enrollmentRepo.create({
      roomId,
      studentId,
    });

    return this.enrollmentRepo.save(enrollment);
  }
}
