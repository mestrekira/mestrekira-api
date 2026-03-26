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
  // Helpers
  // ============================================================

  private async assertSchool(schoolId: string) {
    const sid = norm(schoolId);
    if (!sid) throw new BadRequestException('schoolId é obrigatório.');

    const school = await this.userRepo.findOne({ where: { id: sid } });
    if (!school) throw new NotFoundException('Escola não encontrada.');

    if (roleOf(school) !== 'school' && roleOf(school) !== 'escola') {
      throw new ForbiddenException('Apenas contas de escola podem acessar este recurso.');
    }

    return school;
  }

  private async assertTeacherBelongsToSchool(teacherId: string, schoolId: string) {
    const tid = norm(teacherId);
    if (!tid) throw new BadRequestException('teacherId é obrigatório.');

    const teacher = await this.userRepo.findOne({ where: { id: tid } });
    if (!teacher) throw new NotFoundException('Professor não encontrado.');

    if (roleOf(teacher) !== 'professor') {
      throw new BadRequestException('teacherId deve ser um usuário professor.');
    }

    const pType = professorTypeOf(teacher);
    if (pType !== 'SCHOOL') {
      throw new BadRequestException(
        'Este professor não está cadastrado como professor da escola (professorType != SCHOOL).',
      );
    }

    if (String((teacher as any).schoolId || '') !== String(schoolId)) {
      throw new ForbiddenException('Este professor não pertence a esta escola.');
    }

    return teacher;
  }

  private async generateUniqueCode() {
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const exists = await this.roomRepo.findOne({ where: { code } });
      if (!exists) return code;
    }
    throw new BadRequestException('Não foi possível gerar um código único. Tente novamente.');
  }

  async deleteRoomCascade(roomId: string) {
    const rid = norm(roomId);
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada.');

    const tasks = await this.taskRepo.find({
      where: { roomId: rid },
      select: ['id'],
    });
    const taskIds = tasks.map((t) => t.id);

    if (taskIds.length > 0) {
      await this.essayRepo
        .createQueryBuilder()
        .delete()
        .from(EssayEntity)
        .where('"taskId" IN (:...taskIds)', { taskIds })
        .execute();
    }

    await this.taskRepo.delete({ roomId: rid });
    await this.enrollmentRepo.delete({ roomId: rid });
    await this.roomRepo.delete({ id: rid });

    return { ok: true };
  }

  // ============================================================
  // Professor
  // ============================================================

  async create(name: string, professorId: string) {
    const n = norm(name);
    const p = norm(professorId);

    if (!n || !p) throw new BadRequestException('Informe name e professorId.');

    const professor = await this.userRepo.findOne({ where: { id: p } });
    if (!professor) throw new NotFoundException('Professor não encontrado.');

    if (roleOf(professor) !== 'professor') {
      throw new BadRequestException('Somente professores podem criar sala.');
    }

    const pType = professorTypeOf(professor);
    if (pType === 'SCHOOL') {
      throw new ForbiddenException(
        'Professor cadastrado pela escola não pode criar sala por aqui. Use o painel da escola.',
      );
    }

    const count = await this.roomRepo.count({ where: { professorId: p } });
    if (count >= 10) {
      throw new BadRequestException('Limite atingido: máximo de 10 salas por professor.');
    }

    const code = await this.generateUniqueCode();

    const room = this.roomRepo.create({
      name: n,
      professorId: p,
      code,
      ownerType: 'PROFESSOR',
      schoolId: null,
      teacherId: null,
      teacherNameSnapshot: null,
      schoolYearId: null,
      isActive: true,
      deactivatedAt: null,
    });

    return this.roomRepo.save(room);
  }

  async findByProfessor(professorId: string) {
    const p = norm(professorId);
    if (!p) throw new BadRequestException('professorId é obrigatório.');

    return this.roomRepo.find({
      where: { professorId: p },
      order: { createdAt: 'DESC' as any },
    });
  }

  async findByCode(code: string) {
    const c = norm(code).toUpperCase();
    if (!c) throw new BadRequestException('code é obrigatório.');
    return this.roomRepo.findOne({ where: { code: c } });
  }

  async findAll() {
    return this.roomRepo.find({ order: { createdAt: 'DESC' as any } });
  }

  async findById(id: string) {
    const rid = norm(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    return room;
  }

  async remove(id: string) {
    const rid = norm(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    return this.deleteRoomCascade(rid);
  }

  async withProfessor(roomId: string) {
    const rid = norm(roomId);
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const professor = await this.userRepo.findOne({
      where: { id: room.professorId },
    });

    return {
      room: {
        id: room.id,
        name: room.name,
        code: room.code,
        createdAt: room.createdAt,
        isActive: room.isActive,
        deactivatedAt: room.deactivatedAt,
      },
      professor: professor
        ? { id: professor.id, name: professor.name, email: professor.email }
        : null,
    };
  }

  // ============================================================
  // Escola
  // ============================================================

  async createBySchool(params: {
    name: string;
    schoolId: string;
    teacherId: string;
    schoolYearId?: string;
  }) {
    const n = norm(params?.name);
    const schoolId = norm(params?.schoolId);
    const teacherId = norm(params?.teacherId);
    const schoolYearId = params?.schoolYearId ? norm(params.schoolYearId) : null;

    if (!n) throw new BadRequestException('name é obrigatório.');
    if (!schoolId) throw new BadRequestException('schoolId é obrigatório.');
    if (!teacherId) throw new BadRequestException('teacherId é obrigatório.');

    await this.assertSchool(schoolId);
    const teacher = await this.assertTeacherBelongsToSchool(teacherId, schoolId);

    const count = await this.roomRepo.count({ where: { schoolId } });
    if (count >= 10) {
      throw new BadRequestException('Limite atingido: máximo de 10 salas por escola.');
    }

    const code = await this.generateUniqueCode();

    const room = this.roomRepo.create({
      name: n,
      professorId: teacherId,
      code,
      ownerType: 'SCHOOL',
      schoolId,
      teacherId,
      teacherNameSnapshot: String(teacher.name || '').trim() || null,
      schoolYearId: schoolYearId || null,
      isActive: true,
      deactivatedAt: null,
    });

    return this.roomRepo.save(room);
  }

  async listBySchool(params: { schoolId: string; schoolYearId?: string }) {
    const schoolId = norm(params?.schoolId);
    if (!schoolId) throw new BadRequestException('schoolId é obrigatório.');

    await this.assertSchool(schoolId);

    const year = params?.schoolYearId ? norm(params.schoolYearId) : '';

    const where: any = { schoolId };
    if (year) where.schoolYearId = year;

    return this.roomRepo.find({
      where,
      order: { createdAt: 'DESC' as any },
    });
  }

  async renameBySchool(params: { schoolId: string; roomId: string; name: string }) {
    const schoolId = norm(params?.schoolId);
    const roomId = norm(params?.roomId);
    const name = norm(params?.name);

    if (!schoolId) throw new BadRequestException('schoolId é obrigatório.');
    if (!roomId) throw new BadRequestException('roomId é obrigatório.');
    if (!name) throw new BadRequestException('name é obrigatório.');

    await this.assertSchool(schoolId);

    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Sala não encontrada.');

    if (String(room.schoolId || '') !== schoolId) {
      throw new ForbiddenException('Esta sala não pertence a esta escola.');
    }

    room.name = name;
    return this.roomRepo.save(room);
  }

  async toggleActive(params: {
    roomId: string;
    schoolId: string;
    isActive: boolean;
  }) {
    const roomId = norm(params.roomId);
    const schoolId = norm(params.schoolId);

    if (!roomId) throw new BadRequestException('roomId é obrigatório.');
    if (!schoolId) throw new BadRequestException('schoolId é obrigatório.');

    await this.assertSchool(schoolId);

    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Sala não encontrada.');

    if (String(room.schoolId || '') !== schoolId) {
      throw new ForbiddenException('Esta sala não pertence a esta escola.');
    }

    room.isActive = !!params.isActive;
    room.deactivatedAt = room.isActive ? null : new Date();

    return this.roomRepo.save(room);
  }

  async removeBySchool(params: { schoolId: string; roomId: string }) {
    const schoolId = norm(params?.schoolId);
    const roomId = norm(params?.roomId);

    if (!schoolId) throw new BadRequestException('schoolId é obrigatório.');
    if (!roomId) throw new BadRequestException('roomId é obrigatório.');

    await this.assertSchool(schoolId);

    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Sala não encontrada.');

    if (String(room.schoolId || '') !== schoolId) {
      throw new ForbiddenException('Esta sala não pertence a esta escola.');
    }

    return this.deleteRoomCascade(roomId);
  }

  // ============================================================
  // Alunos
  // ============================================================

  async findStudents(roomId: string) {
    const rid = norm(roomId);
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const enrollments = await this.enrollmentRepo.find({ where: { roomId: rid } });
    if (enrollments.length === 0) return [];

    const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));

    const students = await this.userRepo.find({ where: { id: In(studentIds) } });
    const map = new Map(students.map((s) => [s.id, s]));

    return enrollments.map((e) => {
      const s = map.get(e.studentId);
      return {
        id: e.studentId,
        name: s?.name ?? '(aluno)',
        email: s?.email ?? '',
      };
    });
  }

  async removeStudent(roomId: string, studentId: string) {
    const rid = norm(roomId);
    const sid = norm(studentId);

    if (!rid || !sid) {
      throw new BadRequestException('roomId e studentId são obrigatórios.');
    }

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId: rid, studentId: sid },
    });

    if (!enrollment) return { ok: true, removed: false };

    const tasks = await this.taskRepo.find({ where: { roomId: rid } });
    const taskIds = tasks.map((t) => t.id);

    if (taskIds.length > 0) {
      await this.essayRepo
        .createQueryBuilder()
        .delete()
        .from(EssayEntity)
        .where('"studentId" = :sid', { sid })
        .andWhere('"taskId" IN (:...taskIds)', { taskIds })
        .execute();
    }

    await this.enrollmentRepo.delete({ roomId: rid, studentId: sid });
    return { ok: true, removed: true };
  }

  // ============================================================
  // Overview
  // ============================================================

  async overview(roomId: string) {
    const rid = norm(roomId);
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const professor = await this.userRepo.findOne({
      where: { id: room.professorId },
    });

    const students = await this.findStudents(rid);

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
        isActive: room.isActive,
        deactivatedAt: room.deactivatedAt,
      },
      professor: professor
        ? { id: professor.id, name: professor.name, email: professor.email }
        : null,
      students,
    };
  }
}
