import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { EnrollmentEntity } from './enrollment.entity';
import { RoomEntity } from '../rooms/room.entity';
import { UserEntity } from '../users/user.entity';

function roleOf(user: any) {
  const r = String(user?.role || '').trim().toLowerCase();
  if (r === 'aluno') return 'student';
  if (r === 'teacher') return 'professor';
  if (r === 'escola') return 'school';
  return r;
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

  private normalizeRoomId(roomId: string) {
    const value = String(roomId || '').trim();
    if (!value) throw new BadRequestException('roomId é obrigatório');
    return value;
  }

  private normalizeStudentId(studentId: string) {
    const value = String(studentId || '').trim();
    if (!value) throw new BadRequestException('studentId é obrigatório');
    return value;
  }

  private async assertStudent(studentId: string) {
    const sId = this.normalizeStudentId(studentId);

    const student = await this.userRepo.findOne({ where: { id: sId } });
    if (!student) throw new NotFoundException('Aluno não encontrado');

    if (roleOf(student) !== 'student') {
      throw new BadRequestException(
        'Somente alunos podem executar esta operação',
      );
    }

    return student;
  }

  private async assertRoomExists(roomId: string) {
    const rId = this.normalizeRoomId(roomId);

    const room = await this.roomRepo.findOne({ where: { id: rId } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    return room;
  }

  async enroll(roomId: string, studentId: string) {
    const rId = this.normalizeRoomId(roomId);
    const sId = this.normalizeStudentId(studentId);

    await this.assertStudent(sId);

    const room = await this.assertRoomExists(rId);
    if (room.isActive === false) {
      throw new ForbiddenException('Esta sala está desativada.');
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

  // Entrar em sala por código
  async joinByCode(code: string, studentId: string) {
    const c = String(code || '').trim().toUpperCase();
    const sId = this.normalizeStudentId(studentId);

    if (!c) {
      throw new BadRequestException('code é obrigatório');
    }

    const room = await this.roomRepo.findOne({ where: { code: c } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    if (room.isActive === false) {
      throw new ForbiddenException('Esta sala está desativada.');
    }

    await this.assertStudent(sId);

    const count = await this.enrollmentRepo.count({
      where: { roomId: room.id },
    });
    if (count >= 50) {
      throw new BadRequestException('Sala cheia: máximo de 50 estudantes.');
    }

    return this.enroll(room.id, sId);
  }

  async findRoomsByStudent(studentId: string) {
    const sId = this.normalizeStudentId(studentId);

    await this.assertStudent(sId);

    const enrollments = await this.enrollmentRepo.find({
      where: { studentId: sId },
    });
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
        isActive: r!.isActive ?? true,
      }));
  }

  async leaveRoom(roomId: string, studentId: string) {
    const rId = this.normalizeRoomId(roomId);
    const sId = this.normalizeStudentId(studentId);

    await this.assertStudent(sId);
    await this.assertRoomExists(rId);

    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId: rId, studentId: sId },
    });

    if (!enrollment) {
      throw new NotFoundException(
        'Matrícula não encontrada para esta sala.',
      );
    }

    await this.enrollmentRepo.delete({ roomId: rId, studentId: sId });
    return { ok: true };
  }
}
