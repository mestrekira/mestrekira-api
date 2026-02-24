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
  // ✅ limite atual (este ano: igual ao pago)
  private readonly LIMIT_MAX_STUDENTS_PER_ROOM = 50;

  constructor(
    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,

    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  private norm(s: any) {
    return String(s || '').trim();
  }

  private roleLower(role: any) {
    return String(role || '').trim().toLowerCase();
  }

  private async ensureRoomHasCapacity(roomId: string) {
    const count = await this.enrollmentRepo.count({ where: { roomId } });
    if (count >= this.LIMIT_MAX_STUDENTS_PER_ROOM) {
      throw new BadRequestException(
        `Limite atingido: esta sala já possui ${this.LIMIT_MAX_STUDENTS_PER_ROOM} estudantes.`,
      );
    }
  }

  async enroll(roomId: string, studentId: string) {
    const rId = this.norm(roomId);
    const sId = this.norm(studentId);

    if (!rId || !sId) {
      throw new BadRequestException('roomId e studentId são obrigatórios');
    }

    // já está matriculado?
    const exists = await this.enrollmentRepo.findOne({
      where: { roomId: rId, studentId: sId },
    });
    if (exists) return exists;

    // ✅ limite de 50 por sala (aplicar antes de salvar)
    await this.ensureRoomHasCapacity(rId);

    const enrollment = this.enrollmentRepo.create({
      roomId: rId,
      studentId: sId,
    });

    return this.enrollmentRepo.save(enrollment);
  }

  // 🔹 ENTRADA POR CÓDIGO
  async joinByCode(code: string, studentId: string) {
    const c = this.norm(code).toUpperCase();
    const sId = this.norm(studentId);

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
    // ⚠️ Seu sistema usa 'student'/'professor' em minúsculo.
    const role = this.roleLower(student.role);
    if (role !== 'student') {
      throw new BadRequestException('Somente alunos podem entrar em sala por código');
    }

    // 4) matrícula (com limite)
    return this.enroll(room.id, sId);
  }

  // ✅ listar salas do aluno (retorno leve)
  async findRoomsByStudent(studentId: string) {
    const sId = this.norm(studentId);
    if (!sId) throw new BadRequestException('studentId é obrigatório');

    const student = await this.userRepo.findOne({ where: { id: sId } });
    if (!student) throw new NotFoundException('Aluno não encontrado');

    const role = this.roleLower(student.role);
    if (role !== 'student') {
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
    const rId = this.norm(roomId);
    const sId = this.norm(studentId);

    if (!rId || !sId) {
      throw new BadRequestException('roomId e studentId são obrigatórios');
    }

    await this.enrollmentRepo.delete({ roomId: rId, studentId: sId });
    return { ok: true };
  }

  // ✅ (opcional) alunos da sala (nome/email)
  async findStudentsByRoom(roomId: string) {
    const rId = this.norm(roomId);
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
