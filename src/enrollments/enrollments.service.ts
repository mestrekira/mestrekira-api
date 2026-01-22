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
    const rId = (roomId || '').trim();
    const sId = (studentId || '').trim();

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

  // 🔹 ENTRADA POR CÓDIGO
  async joinByCode(code: string, studentId: string) {
    const c = (code || '').trim().toUpperCase();
    const sId = (studentId || '').trim();

    if (!c || !sId) {
      throw new BadRequestException('code e studentId são obrigatórios');
    }

    // 1) sala existe?
    const room = await this.roomRepo.findOne({ where: { code: c } });
    if (!room) {
      throw new NotFoundException('Sala não encontrada');
    }

    // 2) aluno existe?
    const student = await this.userRepo.findOne({ where: { id: sId } });
    if (!student) {
      throw new NotFoundException('Aluno não encontrado');
    }

    // 3) garante que é aluno (evita professor entrando como aluno)
    const role = String(student.role || '').toUpperCase();
    if (role !== 'STUDENT') {
      throw new BadRequestException('Somente alunos podem entrar em sala por código');
    }

    // 4) matrícula
    return this.enroll(room.id, sId);
  }

 // ✅ listar salas do aluno (retorno leve)
async findRoomsByStudent(studentId: string) {
  const sId = (studentId || '').trim();
  if (!sId) throw new BadRequestException('studentId é obrigatório');

  const student = await this.userRepo.findOne({ where: { id: sId } });
  if (!student) throw new NotFoundException('Aluno não encontrado');

  const role = String(student.role || '').toUpperCase();
  if (role !== 'STUDENT') {
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
      code: r!.code, // opcional (pode remover se não usar)
      professorId: r!.professorId, // opcional
    }));
}


  // ✅ sair da sala
  async leaveRoom(roomId: string, studentId: string) {
    const rId = (roomId || '').trim();
    const sId = (studentId || '').trim();

    if (!rId || !sId) {
      throw new BadRequestException('roomId e studentId são obrigatórios');
    }

    await this.enrollmentRepo.delete({ roomId: rId, studentId: sId });
    return { ok: true };
  }

  // ✅ (opcional) alunos da sala (nome/email)
  async findStudentsByRoom(roomId: string) {
    const rId = (roomId || '').trim();
    if (!rId) throw new BadRequestException('roomId é obrigatório');

    const enrollments = await this.enrollmentRepo.find({ where: { roomId: rId } });
    if (!enrollments.length) return [];

    const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));
    const students = await this.userRepo.find({ where: { id: In(studentIds) } });

    return students.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
    }));
  }
}

