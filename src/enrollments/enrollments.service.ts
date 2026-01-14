import { Injectable } from '@nestjs/common';
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
    const exists = await this.enrollmentRepo.findOne({
      where: { roomId, studentId },
    });

    if (exists) return exists;

    const enrollment = this.enrollmentRepo.create({ roomId, studentId });
    return this.enrollmentRepo.save(enrollment);
  }

  // 🔹 ENTRADA POR CÓDIGO
  async joinByCode(code: string, studentId: string) {
    const room = await this.roomRepo.findOne({ where: { code } });
    if (!room) throw new Error('Sala não encontrada');

    return this.enroll(room.id, studentId);
  }

  // ✅ Para sala do professor: retorna [{id,name,email}]
  async findStudentsByRoom(roomId: string) {
    const enrollments = await this.enrollmentRepo.find({ where: { roomId } });
    if (enrollments.length === 0) return [];

    const studentIds = Array.from(new Set(enrollments.map(e => e.studentId)));
    const students = await this.userRepo.find({ where: { id: In(studentIds) } });

    const map = new Map(students.map(s => [s.id, s]));

    return enrollments.map(e => {
      const s = map.get(e.studentId);
      return {
        id: e.studentId,
        name: s?.name ?? '(aluno)',
        email: s?.email ?? '',
      };
    });
  }

  async findRoomsByStudent(studentId: string) {
    const enrollments = await this.enrollmentRepo.find({
      where: { studentId },
    });

    if (enrollments.length === 0) return [];

    const roomIds = enrollments.map(e => e.roomId);

    return this.roomRepo.findBy({
      id: In(roomIds),
    });
  }

  // ✅ (reboco futuro) aluno sair da sala
  async leaveRoom(roomId: string, studentId: string) {
    await this.enrollmentRepo.delete({ roomId, studentId });
    return { ok: true };
  }
}
