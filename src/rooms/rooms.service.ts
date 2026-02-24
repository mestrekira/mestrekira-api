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

@Injectable()
export class RoomsService {
  // ✅ limites atuais (este ano: igual ao pago)
  private readonly LIMIT_MAX_ROOMS_PROFESSOR = 10;

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

  private normalizeEmail(s: string) {
    return String(s || '').trim().toLowerCase();
  }

  private normalizeText(s: string) {
    return String(s || '').trim();
  }

  private normalizeRoleLower(role: any) {
    return String(role || '').trim().toLowerCase();
  }

  private normalizeProfessorTypeUpper(t: any) {
    return String(t || '').trim().toUpperCase();
  }

  private async generateUniqueRoomCode(maxAttempts = 12) {
    for (let i = 0; i < maxAttempts; i++) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const exists = await this.roomRepo.findOne({ where: { code } });
      if (!exists) return code;
    }
    // fallback mais longo
    for (let i = 0; i < maxAttempts; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const exists = await this.roomRepo.findOne({ where: { code } });
      if (!exists) return code;
    }
    throw new BadRequestException('Não foi possível gerar um código único para a sala.');
  }

  /**
   * Cria sala no fluxo atual do professor.
   * Regras:
   * - professorId deve existir e ser role='professor'
   * - professorType:
   *    - null (legado) => tratado como INDIVIDUAL
   *    - 'INDIVIDUAL'  => pode criar com limite
   *    - 'SCHOOL'      => bloqueado (salas devem ser criadas pela escola)
   * - limite: 10 salas por professor individual
   */
  async create(name: string, professorId: string) {
    const n = this.normalizeText(name);
    const p = this.normalizeText(professorId);

    if (!n || !p) {
      throw new BadRequestException('Informe name e professorId.');
    }

    const professor = await this.userRepo.findOne({ where: { id: p } });
    if (!professor) {
      throw new NotFoundException('Professor não encontrado.');
    }

    const role = this.normalizeRoleLower(professor.role);
    if (role !== 'professor') {
      throw new BadRequestException('professorId inválido (usuário não é professor).');
    }

    // professorType legado => INDIVIDUAL
    const professorType = this.normalizeProfessorTypeUpper((professor as any).professorType);
    const effectiveType = professorType || 'INDIVIDUAL';

    // professor gerenciado por escola não cria sala por aqui
    if (effectiveType === 'SCHOOL') {
      throw new ForbiddenException(
        'Professor cadastrado pela escola não pode criar sala. A sala deve ser criada no painel da escola.',
      );
    }

    // ✅ limite de 10 salas por professor individual
    const currentRooms = await this.roomRepo.count({ where: { professorId: p } });
    if (currentRooms >= this.LIMIT_MAX_ROOMS_PROFESSOR) {
      throw new BadRequestException(
        `Limite atingido: no máximo ${this.LIMIT_MAX_ROOMS_PROFESSOR} salas por professor.`,
      );
    }

    const code = await this.generateUniqueRoomCode();

    // ✅ compatível com sua RoomEntity atual + campos novos (se já existirem no banco)
    const room = this.roomRepo.create({
      name: n,
      professorId: p,
      code,

      // novos campos (não quebram se já estiverem na entity)
      ownerType: 'PROFESSOR',
      schoolId: null,
      teacherNameSnapshot: null,
    } as any);

    return this.roomRepo.save(room);
  }

  async findByProfessor(professorId: string) {
    const p = this.normalizeText(professorId);
    if (!p) throw new BadRequestException('professorId é obrigatório.');
    return this.roomRepo.find({ where: { professorId: p } });
  }

  async findAll() {
    return this.roomRepo.find();
  }

  async findById(id: string) {
    const rid = this.normalizeText(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');
    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');
    return room;
  }

  async findByCode(code: string) {
    const c = this.normalizeText(code).toUpperCase();
    if (!c) throw new BadRequestException('code é obrigatório.');
    return this.roomRepo.findOne({ where: { code: c } });
  }

  /**
   * ✅ Lista alunos matriculados (baseado nos enrollments)
   * - Nunca “some” aluno por falha no join do UserEntity
   * - Retorna fallback quando usuário não é encontrado
   */
  async findStudents(roomId: string) {
    const rid = this.normalizeText(roomId);
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

  /**
   * ✅ Professor remove aluno da sala:
   * - remove matrícula
   * - remove redações do aluno vinculadas às tarefas dessa sala (libera armazenamento)
   */
  async removeStudent(roomId: string, studentId: string) {
    const rid = this.normalizeText(roomId);
    const sid = this.normalizeText(studentId);

    if (!rid || !sid) {
      throw new BadRequestException('roomId e studentId são obrigatórios.');
    }

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId: rid, studentId: sid },
    });

    if (!enrollment) {
      return { ok: true, removed: false };
    }

    // ✅ apaga redações do aluno nas tarefas dessa sala
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
    const rid = this.normalizeText(roomId);
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
    const rid = this.normalizeText(roomId);
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

  /**
   * ✅ Remove sala:
   * - apaga redações das tarefas
   * - apaga tarefas, matrículas e a sala
   */
  async remove(id: string) {
    const rid = this.normalizeText(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada');

    const tasks = await this.taskRepo.find({ where: { roomId: rid } });
    const taskIds = tasks.map((t) => t.id);

    // apaga redações de todas as tarefas dessa sala
    if (taskIds.length > 0) {
      await this.essayRepo
        .createQueryBuilder()
        .delete()
        .from(EssayEntity)
        .where('"taskId" IN (:...taskIds)', { taskIds })
        .execute();
    }

    // apaga tarefas, matrículas e sala
    await this.taskRepo.delete({ roomId: rid });
    await this.enrollmentRepo.delete({ roomId: rid });
    await this.roomRepo.delete(rid);

    return { ok: true };
  }
}
