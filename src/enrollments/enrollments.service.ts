import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { EnrollmentEntity } from './enrollment.entity';
import { RoomEntity } from '../rooms/room.entity';
import { UserEntity } from '../users/user.entity';

function roleOf(user: any) {
  return String(user?.role || '').trim().toLowerCase();
}

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
    const rId = String(roomId || '').trim();
    const sId = String(studentId || '').trim();

    if (!rId || !sId) {
      throw new BadRequestException('roomId e studentId são obrigatórios');
    }

    const exists = await this.enrollmentRepo.findOne({
      where: { roomId: rId, studentId: sId },
    });
    if (exists) return exists;

    const enrollment = this.enrollmentRepo.create({
      roomId: rId,
      studentId: sId,
    });

    return this.enrollmentRepo.save(enrollment);
  }

  // 🔹 ENTRADA POR CÓDIGO + ✅ LIMITE 50
  async joinByCode(code: string, studentId: string) {
    const c = String(code || '').trim().toUpperCase();
    const sId = String(studentId || '').trim();

    if (!c || !sId) {
      throw new BadRequestException('code e studentId são obrigatórios');
    }

    const room = await this.roomRepo.findOne({ where: { code: c } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const student = await this.userRepo.findOne({ where: { id: sId } });
    if (!student) throw new NotFoundException('Aluno não encontrado');

    if (roleOf(student) !== 'student') {
      throw new BadRequestException('Somente alunos podem entrar em sala por código');
    }

    // ✅ limite de 50 alunos por sala
    const count = await this.enrollmentRepo.count({ where: { roomId: room.id } });
    if (count >= 50) {
      throw new BadRequestException('Sala cheia: máximo de 50 estudantes.');
    }

    return this.enroll(room.id, sId);
  }

  async findRoomsByStudent(studentId: string) {
    const sId = String(studentId || '').trim();
    if (!sId) throw new BadRequestException('studentId é obrigatório');

    const student = await this.userRepo.findOne({ where: { id: sId } });
    if (!student) throw new NotFoundException('Aluno não encontrado');

    if (roleOf(student) !== 'student') {
      throw new BadRequestException('Apenas alunos podem listar salas por matrícula');
    }

    const enrollments = await this.enrollmentRepo.find({ where: { studentId: sId } });
    if (!enrollments.length) return [];

    const roomIds = Array.from(new Set(enrollments.map((e) => e.roomId)));

    const rooms = await this.roomRepo.findBy({ id: In(roomIds) });
    const map = new Map(rooms.map((r) => [r.id, r]));

    return roomIds
      .map((id) => map.get(id))
      .filter(Boolean)
      .map((r) => ({
        id: r!.id,
        name: r!.name,
        code: r!.code,
        professorId: r!.professorId,
      }));
  }

  async leaveRoom(roomId: string, studentId: string) {
    const rId = String(roomId || '').trim();
    const sId = String(studentId || '').trim();

    if (!rId || !sId) {
      throw new BadRequestException('roomId e studentId são obrigatórios');
    }

    await this.enrollmentRepo.delete({ roomId: rId, studentId: sId });
    return { ok: true };
  }
}
