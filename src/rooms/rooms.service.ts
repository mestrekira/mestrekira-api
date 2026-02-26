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
  return String((user as any)?.professorType || '').trim().toUpperCase(); // INDIVIDUAL | SCHOOL_MANAGED | ...
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

  /**
   * ✅ Cria sala (fluxo do professor individual)
   * Regras:
   * - professor deve existir e ser role=professor
   * - professorType=SCHOOL_MANAGED NÃO cria sala por aqui (só via painel da escola)
   * - limite: 10 salas por professor (este ano: mesmo limite do pago)
   */
  async create(name: string, professorId: string) {
    const n = String(name || '').trim();
    const p = String(professorId || '').trim();

    if (!n || !p) throw new BadRequestException('Informe name e professorId.');

    const professor = await this.userRepo.findOne({ where: { id: p } });
    if (!professor) throw new NotFoundException('Professor não encontrado.');

    if (roleOf(professor) !== 'professor') {
      throw new BadRequestException('Somente professores podem criar sala.');
    }

    const pType = professorTypeOf(professor);

    // ✅ professor gerenciado por escola não cria por esse endpoint
    if (pType === 'SCHOOL_MANAGED') {
      throw new ForbiddenException(
        'Professor gerenciado por escola não pode criar sala por aqui. Use o painel da escola.',
      );
    }

    // ✅ limite de 10 salas (este ano: mesmo do pago)
    const count = await this.roomRepo.count({ where: { professorId: p } });
    if (count >= 10) {
      throw new BadRequestException(
        'Limite atingido: máximo de 10 salas por professor.',
      );
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const room = this.roomRepo.create({
      name: n,
      professorId: p,
      code,
    });

    return this.roomRepo.save(room);
  }

  async findByProfessor(professorId: string) {
    const p = String(professorId || '').trim();
    if (!p) throw new BadRequestException('professorId é obrigatório.');
    return this.roomRepo.find({ where: { professorId: p } });
  }

  async findAll() {
    return this.roomRepo.find();
  }

  async findById(id: string) {
    const rid = String(id || '').trim();
    if (!rid) throw new BadRequestException('id é obrigatório.');
    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');
    return room;
  }

  async findByCode(code: string) {
    const c = String(code || '').trim().toUpperCase();
    if (!c) throw new BadRequestException('code é obrigatório.');
    return this.roomRepo.findOne({ where: { code: c } });
  }

  /**
   * ✅ Lista alunos matriculados (fallback se user não existe)
   */
  async findStudents(roomId: string) {
    const rid = String(roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const enrollments = await this.enrollmentRepo.find({
      where: { roomId: rid },
    });
    if (enrollments.length === 0) return [];

    const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));

    const students = await this.userRepo.find({
      where: { id: In(studentIds) },
    });

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
    const rid = String(roomId || '').trim();
    const sid = String(studentId || '').trim();
    if (!rid || !sid) {
      throw new BadRequestException('roomId e studentId são obrigatórios.');
    }

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId: rid, studentId: sid },
    });

    if (!enrollment) return { ok: true, removed: false };

    // apaga redações do aluno nas tarefas dessa sala
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

  async overview(roomId: string) {
    const rid = String(roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const professor = await this.userRepo.findOne({
      where: { id: room.professorId },
    });

    const students = await this.findStudents(rid);

    return {
      room: { id: room.id, name: room.name, code: room.code },
      professor: professor
        ? { id: professor.id, name: professor.name, email: professor.email }
        : null,
      students,
    };
  }

  async withProfessor(roomId: string) {
    const rid = String(roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const professor = await this.userRepo.findOne({
      where: { id: room.professorId },
    });

    return {
      room: { id: room.id, name: room.name, code: room.code },
      professor: professor
        ? { id: professor.id, name: professor.name, email: professor.email }
        : null,
    };
  }

  async remove(id: string) {
    const rid = String(id || '').trim();
    if (!rid) throw new BadRequestException('id é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const tasks = await this.taskRepo.find({ where: { roomId: rid } });
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
    await this.roomRepo.delete(rid);

    return { ok: true };
  }
}
