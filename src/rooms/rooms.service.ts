import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomEntity } from './room.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { UserEntity } from '../users/user.entity';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,

    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async create(name: string, professorId: string) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

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

  async findAll() {
    return this.roomRepo.find();
  }

  async findById(id: string) {
    const room = await this.roomRepo.findOne({ where: { id } });

    if (!room) {
      throw new NotFoundException('Sala não encontrada');
    }

    return room;
  }

  async findStudents(roomId: string) {
    const enrollments = await this.enrollmentRepo.find({
      where: { roomId },
    });

    const studentIds = enrollments.map(e => e.studentId);

    if (studentIds.length === 0) return [];

    const students = await this.userRepo.findByIds(studentIds);

    return students.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
    }));
  }
}

async findByCode(code: string) {
  const room = await this.roomRepo.findOne({
    where: { code },
  });

  if (!room) {
    throw new NotFoundException('Código de sala inválido');
  }

  return room;
}
