import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomEntity } from './room.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,

    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,
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

  // 🔹 NOVO: buscar sala por ID
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
      relations: ['student'],
    });

    return enrollments.map(e => ({
      id: e.student.id,
      name: e.student.name,
      email: e.student.email,
    }));
  }
}
