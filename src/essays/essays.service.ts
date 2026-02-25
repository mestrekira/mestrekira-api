import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, QueryFailedError } from 'typeorm';

import { EssayEntity } from './essay.entity';
import { UserEntity } from '../users/user.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { RoomEntity } from '../rooms/room.entity';

@Injectable()
export class EssaysService {
  constructor(
    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,

    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,

    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,
  ) {}

  private normId(v: any) {
    const s = String(v || '').trim();
    return s && s !== 'undefined' && s !== 'null' ? s : '';
  }

  private extractBodyFromPackedContent(content: string) {
    const text = String(content ?? '').replace(/\r\n/g, '\n');
    const m = text.match(/^__TITLE__\s*:\s*.*?\n\n([\s\S]*)$/i);
    if (m) return String(m[1] ?? '');
    return text;
  }

  private isUniqueViolation(err: any) {
    return (
      err instanceof QueryFailedError &&
      (err as any)?.driverError?.code === '23505'
    );
  }

  private async ensureTask(taskId: string) {
    const tid = this.normId(taskId);
    if (!tid) throw new BadRequestException('taskId é obrigatório.');
    const task = await this.taskRepo.findOne({ where: { id: tid } });
    if (!task) throw new NotFoundException('Tarefa não encontrada.');
    return task;
  }

  private async ensureRoom(roomId: string) {
    const rid = this.normId(roomId);
    if (!rid) throw new BadRequestException('roomId é obrigatório.');
    const room = await this.roomRepo.findOne({ where: { id: rid } });
    if (!room) throw new NotFoundException('Sala não encontrada.');
    return room;
  }

  private async ensureStudentExists(studentId: string) {
    const sid = this.normId(studentId);
    if (!sid) throw new BadRequestException('studentId é obrigatório.');
    const s = await this.userRepo.findOne({ where: { id: sid } });
    if (!s) throw new NotFoundException('Aluno não encontrado.');
    const role = String(s.role || '').toLowerCase();
    if (role !== 'student') throw new ForbiddenException('Somente alunos podem executar esta ação.');
    return s;
  }

  /**
   * ✅ garante que o aluno está matriculado na sala da tarefa
   */
  private async ensureEnrollmentForTask(taskId: string, studentId: string) {
    const task = await this.ensureTask(taskId);
    const room = await this.ensureRoom(task.roomId);

    await this.ensureStudentExists(studentId);

    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId: room.id, studentId: this.normId(studentId) },
    });

    if (!enrollment) throw new ForbiddenException('Aluno não matriculado na sala desta tarefa.');
    return { task, room };
  }

  /**
   * ✅ garante que o professor é dono da sala da tarefa
   */
  private async ensureProfessorOwnsTask(taskId: string, professorId: string) {
    const pid = this.normId(professorId);
    if (!pid) throw new BadRequestException('Sessão inválida.');

    const task = await this.ensureTask(taskId);
    const room = await this.ensureRoom(task.roomId);

    if (String(room.professorId) !== pid) {
      throw new ForbiddenException('Você não tem permissão para acessar esta tarefa.');
    }

    return { task, room };
  }

  // ✅ salvar rascunho (aluno) — exige matrícula
  async saveDraft(taskId: string, studentId: string, content: string) {
    const sid = this.normId(studentId);
    const text = String(content ?? '');

    await this.ensureEnrollmentForTask(taskId, sid);

    const existing = await this.essayRepo.findOne({
      where: { taskId: this.normId(taskId), studentId: sid },
    });

    if (existing && existing.isDraft === false) {
      throw new ConflictException(
        'Você já enviou esta redação. Não é possível salvar rascunho.',
      );
    }

    if (!existing) {
      try {
        const essay = this.essayRepo.create({
          taskId: this.normId(taskId),
          studentId: sid,
          content: text,
          isDraft: true,
        });
        return await this.essayRepo.save(essay);
      } catch (err) {
        if (!this.isUniqueViolation(err)) throw err;

        const again = await this.essayRepo.findOne({
          where: { taskId: this.normId(taskId), studentId: sid },
        });

        if (again && again.isDraft === false) {
          throw new ConflictException(
            'Você já enviou esta redação. Não é possível salvar rascunho.',
          );
        }
        if (!again) throw err;

        await this.essayRepo.update(again.id, {
          content: text,
          isDraft: true,
        });

        return this.essayRepo.findOne({ where: { id: again.id } });
      }
    }

    await this.essayRepo.update(existing.id, {
      content: text,
      isDraft: true,
    });

    return this.essayRepo.findOne({ where: { id: existing.id } });
  }

  // ✅ enviar redação (aluno) — exige matrícula
  async submit(taskId: string, studentId: string, content: string) {
    const sid = this.normId(studentId);
    const text = String(content ?? '');

    await this.ensureEnrollmentForTask(taskId, sid);

    const body = this.extractBodyFromPackedContent(text);
    if ((body || '').length < 500) {
      throw new BadRequestException('A redação deve ter pelo menos 500 caracteres.');
    }

    const existing = await this.essayRepo.findOne({
      where: { taskId: this.normId(taskId), studentId: sid },
    });

    if (existing && existing.isDraft === false) {
      throw new ConflictException('Você já enviou esta redação para esta tarefa.');
    }

    if (!existing) {
      const essay = this.essayRepo.create({
        taskId: this.normId(taskId),
        studentId: sid,
        content: text,
        isDraft: false,
      });
      return this.essayRepo.save(essay);
    }

    await this.essayRepo.update(existing.id, {
      content: text,
      isDraft: false,
    });

    return this.essayRepo.findOne({ where: { id: existing.id } });
  }

  // ✅ buscar (aluno) — exige matrícula
  async findByTaskAndStudent(taskId: string, studentId: string) {
    const sid = this.normId(studentId);
    await this.ensureEnrollmentForTask(taskId, sid);

    return this.essayRepo.findOne({
      where: { taskId: this.normId(taskId), studentId: sid },
    });
  }

  // ✅ corrigir (professor) — exige ownership
  async correctEnem(
    id: string,
    feedback: string,
    c1: number,
    c2: number,
    c3: number,
    c4: number,
    c5: number,
    professorId?: string,
  ) {
    const essayId = this.normId(id);
    if (!essayId) throw new BadRequestException('id é obrigatório.');

    const essay = await this.essayRepo.findOne({ where: { id: essayId } });
    if (!essay) throw new NotFoundException('Redação não encontrada.');

    if (professorId) {
      await this.ensureProfessorOwnsTask(essay.taskId, professorId);
    }

    const score = Number(c1) + Number(c2) + Number(c3) + Number(c4) + Number(c5);

    await this.essayRepo.update(essayId, {
      feedback,
      c1,
      c2,
      c3,
      c4,
      c5,
      score,
      isDraft: false,
    });

    return this.essayRepo.findOne({ where: { id: essayId } });
  }

  // ✅ lista por tarefa (professor) — exige ownership
  async findByTask(taskId: string, professorId?: string) {
    const tid = this.normId(taskId);
    if (!tid) throw new BadRequestException('taskId é obrigatório.');

    if (professorId) await this.ensureProfessorOwnsTask(tid, professorId);

    return this.essayRepo.find({
      where: { taskId: tid, isDraft: false },
      order: { createdAt: 'DESC' as any, id: 'ASC' as any },
    });
  }

  // ✅ professor: redações + aluno — exige ownership
  async findByTaskWithStudent(taskId: string, professorId?: string) {
    const tid = this.normId(taskId);
    if (!tid) throw new BadRequestException('taskId é obrigatório.');

    if (professorId) await this.ensureProfessorOwnsTask(tid, professorId);

    const essays = await this.essayRepo.find({
      where: { taskId: tid, isDraft: false },
      order: { createdAt: 'DESC' as any, id: 'ASC' as any },
    });
    if (essays.length === 0) return [];

    const studentIds = Array.from(new Set(essays.map((e) => e.studentId)));
    const students = await this.userRepo.find({ where: { id: In(studentIds) } });
    const map = new Map(students.map((s) => [s.id, s]));

    return essays.map((e) => {
      const s = map.get(e.studentId);
      return {
        id: e.id,
        taskId: e.taskId,
        studentId: e.studentId,
        content: e.content,
        feedback: e.feedback ?? null,
        c1: e.c1 ?? null,
        c2: e.c2 ?? null,
        c3: e.c3 ?? null,
        c4: e.c4 ?? null,
        c5: e.c5 ?? null,
        score: e.score ?? null,
        isDraft: e.isDraft ?? false,
        createdAt: e.createdAt ?? null,
        updatedAt: e.updatedAt ?? null,
        studentName: s?.name ?? '(aluno não encontrado)',
        studentEmail: s?.email ?? '',
      };
    });
  }

  async findOne(id: string) {
    const eid = this.normId(id);
    if (!eid) throw new BadRequestException('id é obrigatório.');
    return this.essayRepo.findOne({ where: { id: eid } });
  }

  // ✅ professor: detalhe com aluno — (se quiser ownership, passe professorId aqui também)
  async findOneWithStudent(id: string, professorId?: string) {
    const eid = this.normId(id);
    if (!eid) throw new BadRequestException('id é obrigatório.');

    const essay = await this.essayRepo.findOne({ where: { id: eid } });
    if (!essay) return null;

    if (professorId) {
      await this.ensureProfessorOwnsTask(essay.taskId, professorId);
    }

    const student = await this.userRepo.findOne({ where: { id: essay.studentId } });

    return {
      ...essay,
      studentName: student?.name ?? '(aluno não encontrado)',
      studentEmail: student?.email ?? '',
    };
  }

  // ✅ professor: desempenho por sala — exige ownership (pela sala)
  async performanceByRoom(roomId: string, professorId?: string) {
    const rid = this.normId(roomId);
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.ensureRoom(rid);

    if (professorId && String(room.professorId) !== this.normId(professorId)) {
      throw new ForbiddenException('Você não tem permissão para ver desempenho desta sala.');
    }

    const tasks = await this.taskRepo.find({ where: { roomId: rid } });
    if (tasks.length === 0) return [];

    const taskIds = tasks.map((t) => t.id);
    const essays = await this.essayRepo.find({
      where: { taskId: In(taskIds), isDraft: false },
    });
    if (essays.length === 0) return [];

    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const studentIds = Array.from(new Set(essays.map((e) => e.studentId)));
    const students = await this.userRepo.find({ where: { id: In(studentIds) } });
    const studentMap = new Map(students.map((s) => [s.id, s]));

    return essays.map((e) => {
      const t = taskMap.get(e.taskId);
      const s = studentMap.get(e.studentId);

      return {
        id: e.id,
        taskId: e.taskId,
        taskTitle: t?.title ?? '(tarefa)',
        studentId: e.studentId,
        studentName: s?.name ?? '(aluno não encontrado)',
        studentEmail: s?.email ?? '',
        isDraft: e.isDraft ?? false,
        score: e.score ?? null,
        c1: e.c1 ?? null,
        c2: e.c2 ?? null,
        c3: e.c3 ?? null,
        c4: e.c4 ?? null,
        c5: e.c5 ?? null,
        feedback: e.feedback ?? null,
        content: e.content ?? '',
        createdAt: e.createdAt ?? null,
        updatedAt: e.updatedAt ?? null,
      };
    });
  }

  // ✅ aluno: desempenho por sala (dele) — exige matrícula
  async performanceByRoomForStudent(roomId: string, studentId: string) {
    const rid = this.normId(roomId);
    const sid = this.normId(studentId);
    if (!rid || !sid) throw new BadRequestException('roomId e studentId são obrigatórios.');

    const tasks = await this.taskRepo.find({ where: { roomId: rid } });
    if (tasks.length === 0) return [];

    const taskIds = tasks.map((t) => t.id);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // exige matrícula em qualquer tarefa daquela sala
    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId: rid, studentId: sid },
    });
    if (!enrollment) throw new ForbiddenException('Aluno não matriculado na sala.');

    const essays = await this.essayRepo.find({
      where: { taskId: In(taskIds), studentId: sid, isDraft: false },
      order: { createdAt: 'DESC' as any, id: 'ASC' as any },
    });

    return essays.map((e) => {
      const t = taskMap.get(e.taskId);
      return {
        id: e.id,
        taskId: e.taskId,
        taskTitle: t?.title ?? '(tarefa)',
        isDraft: e.isDraft ?? false,
        score: e.score ?? null,
        c1: e.c1 ?? null,
        c2: e.c2 ?? null,
        c3: e.c3 ?? null,
        c4: e.c4 ?? null,
        c5: e.c5 ?? null,
        feedback: e.feedback ?? null,
        createdAt: e.createdAt ?? null,
        updatedAt: e.updatedAt ?? null,
      };
    });
  }

  // ✅ PDF: redações completas por sala/aluno — exige matrícula
  async findEssaysWithContentByRoomForStudent(roomId: string, studentId: string) {
    const rid = this.normId(roomId);
    const sid = this.normId(studentId);
    if (!rid || !sid) throw new BadRequestException('roomId e studentId são obrigatórios.');

    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId: rid, studentId: sid },
    });
    if (!enrollment) throw new ForbiddenException('Aluno não matriculado na sala.');

    const tasks = await this.taskRepo.find({ where: { roomId: rid } });
    if (tasks.length === 0) return [];

    const taskIds = tasks.map((t) => t.id);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const essays = await this.essayRepo.find({
      where: { taskId: In(taskIds), studentId: sid, isDraft: false },
      order: { createdAt: 'DESC' as any, id: 'ASC' as any },
    });

    return essays.map((e) => {
      const t = taskMap.get(e.taskId);
      return {
        id: e.id,
        taskId: e.taskId,
        taskTitle: t?.title ?? '(tarefa)',
        score: e.score ?? null,
        c1: e.c1 ?? null,
        c2: e.c2 ?? null,
        c3: e.c3 ?? null,
        c4: e.c4 ?? null,
        c5: e.c5 ?? null,
        content: this.extractBodyFromPackedContent(e.content ?? ''),
        createdAt: e.createdAt ?? null,
        updatedAt: e.updatedAt ?? null,
      };
    });
  }
}
