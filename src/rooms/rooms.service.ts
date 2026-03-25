import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { RoomEntity } from './room.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EssayEntity } from '../essays/essay.entity';
import { UserEntity } from '../users/user.entity';

function roleOf(user: any) {
  return String(user?.role || '').trim().toLowerCase();
}

function professorTypeOf(user: any) {
  return String((user as any)?.professorType || '').trim().toUpperCase();
}

function norm(v: any) {
  const s = String(v ?? '').trim();
  return s && s !== 'undefined' && s !== 'null' ? s : '';
}

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,

    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,

    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,

    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  // ============================================================
  // HELPERS
  // ============================================================

  private async assertSchool(schoolId: string) {
    const school = await this.userRepo.findOne({ where: { id: schoolId } });

    if (!school) throw new NotFoundException('Escola não encontrada.');
    if (roleOf(school) !== 'school') {
      throw new ForbiddenException('Apenas contas de escola podem acessar.');
    }

    return school;
  }

  private async assertTeacherBelongsToSchool(teacherId: string, schoolId: string) {
    const teacher = await this.userRepo.findOne({ where: { id: teacherId } });

    if (!teacher) throw new NotFoundException('Professor não encontrado.');
    if (roleOf(teacher) !== 'professor') {
      throw new BadRequestException('Usuário não é professor.');
    }

    if (professorTypeOf(teacher) !== 'SCHOOL') {
      throw new BadRequestException('Professor não pertence a escola.');
    }

    if (String((teacher as any).schoolId) !== schoolId) {
      throw new ForbiddenException('Professor não pertence a esta escola.');
    }

    return teacher;
  }

  private async generateUniqueCode() {
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const exists = await this.roomRepo.findOne({ where: { code } });
      if (!exists) return code;
    }
    throw new BadRequestException('Erro ao gerar código.');
  }

  // ============================================================
  // 🔥 NOVO: TOGGLE DE ATIVAÇÃO
  // ============================================================

  async toggleActive(params: {
    roomId: string;
    schoolId: string;
    isActive: boolean;
  }) {
    const roomId = norm(params.roomId);
    const schoolId = norm(params.schoolId);

    await this.assertSchool(schoolId);

    const room = await this.roomRepo.findOne({ where: { id: roomId } });

    if (!room) throw new NotFoundException('Sala não encontrada.');

    if (String(room.schoolId || '') !== schoolId) {
      throw new ForbiddenException('Sala não pertence a esta escola.');
    }

    room.isActive = !!params.isActive;
    room.deactivatedAt = room.isActive ? null : new Date();

    return this.roomRepo.save(room);
  }

  // ============================================================
  // CREATE
  // ============================================================

  async create(name: string, professorId: string) {
    const code = await this.generateUniqueCode();

    const room = this.roomRepo.create({
      name,
      professorId,
      code,
      ownerType: 'PROFESSOR',
    });

    return this.roomRepo.save(room);
  }

  async createBySchool(params: {
    name: string;
    schoolId: string;
    teacherId: string;
    schoolYearId?: string;
  }) {
    const { name, schoolId, teacherId, schoolYearId } = params;

    await this.assertSchool(schoolId);
    const teacher = await this.assertTeacherBelongsToSchool(teacherId, schoolId);

    const code = await this.generateUniqueCode();

    const room = this.roomRepo.create({
      name,
      professorId: teacherId,
      ownerType: 'SCHOOL',
      schoolId,
      teacherId,
      teacherNameSnapshot: teacher.name,
      schoolYearId: schoolYearId || null,
      code,
      isActive: true,
    });

    return this.roomRepo.save(room);
  }

  // ============================================================
  // FIND
  // ============================================================

  async findById(id: string) {
    const room = await this.roomRepo.findOne({ where: { id } });
    if (!room) throw new NotFoundException('Sala não encontrada');
    return room;
  }

  async listBySchool(params: { schoolId: string; schoolYearId?: string }) {
    const where: any = { schoolId: params.schoolId };

    if (params.schoolYearId) {
      where.schoolYearId = params.schoolYearId;
    }

    return this.roomRepo.find({
      where,
      order: { createdAt: 'DESC' as any },
    });
  }

  async findStudents(roomId: string) {
    const enrollments = await this.enrollmentRepo.find({
      where: { roomId },
    });

    const ids = enrollments.map((e) => e.studentId);

    const users = await this.userRepo.find({
      where: { id: In(ids) },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
    }));
  }

  // ============================================================
  // OVERVIEW (🔥 corrigido com isActive)
  // ============================================================

  async overview(roomId: string) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const professor = await this.userRepo.findOne({
      where: { id: room.professorId },
    });

    const students = await this.findStudents(roomId);

    return {
      room: {
        id: room.id,
        name: room.name,
        code: room.code,
        ownerType: room.ownerType,
        schoolId: room.schoolId,
        teacherId: room.teacherId,
        teacherNameSnapshot: room.teacherNameSnapshot,
        schoolYearId: room.schoolYearId,
        createdAt: room.createdAt,

        // ✅ ESSENCIAL
        isActive: room.isActive,
        deactivatedAt: room.deactivatedAt,
      },
      professor: professor
        ? {
            id: professor.id,
            name: professor.name,
            email: professor.email,
          }
        : null,
      students,
    };
  }

  // ============================================================
  // REMOVE
  // ============================================================

  async removeBySchool(params: { schoolId: string; roomId: string }) {
    const { schoolId, roomId } = params;

    await this.assertSchool(schoolId);

    const room = await this.roomRepo.findOne({ where: { id: roomId } });

    if (!room) throw new NotFoundException('Sala não encontrada.');

    if (String(room.schoolId) !== schoolId) {
      throw new ForbiddenException('Sem permissão.');
    }

    await this.essayRepo.delete({
      taskId: In(
        (await this.taskRepo.find({ where: { roomId } })).map((t) => t.id),
      ),
    });

    await this.taskRepo.delete({ roomId });
    await this.enrollmentRepo.delete({ roomId });
    await this.roomRepo.delete(roomId);

    return { ok: true };
  }
}
