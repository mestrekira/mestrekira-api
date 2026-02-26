import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { UserEntity } from '../users/user.entity';
import { RoomEntity } from '../rooms/room.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EssayEntity } from '../essays/essay.entity';

function roleOf(user: any) {
  return String(user?.role || '').trim().toLowerCase();
}
function professorTypeOf(user: any) {
  return String((user as any)?.professorType || '').trim().toUpperCase();
}
function normalizeEmail(email: any) {
  return String(email || '').trim().toLowerCase();
}

@Injectable()
export class SchoolsService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,

    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,

    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,
  ) {}

  async createRoomForTeacher(schoolId: string, roomName: string, teacherEmail: string) {
    const sid = String(schoolId || '').trim();
    const name = String(roomName || '').trim();
    const email = normalizeEmail(teacherEmail);

    if (!sid) throw new BadRequestException('schoolId é obrigatório.');
    if (!name) throw new BadRequestException('roomName é obrigatório.');
    if (!email.includes('@')) throw new BadRequestException('teacherEmail inválido.');

    const school = await this.userRepo.findOne({ where: { id: sid } });
    if (!school) throw new NotFoundException('Escola não encontrada.');
    if (roleOf(school) !== 'school') throw new ForbiddenException('Apenas escola.');

    const teacher = await this.userRepo.findOne({ where: { email } });
    if (!teacher) throw new NotFoundException('Professor não encontrado pelo e-mail.');

    if (roleOf(teacher) !== 'professor') {
      throw new BadRequestException('Este e-mail não pertence a um professor.');
    }

    // ✅ precisa ser professor gerenciado e da MESMA escola
    if (professorTypeOf(teacher) !== 'SCHOOL_MANAGED') {
      throw new BadRequestException('Professor não é gerenciado por escola.');
    }

    const teacherSchoolId = String((teacher as any)?.schoolId || '').trim();
    if (teacherSchoolId !== sid) {
      throw new ForbiddenException('Este professor não pertence a esta escola.');
    }

    // ✅ regra: escola só pode cadastrar 1 sala por professor
    const existing = await this.roomRepo.findOne({ where: { professorId: teacher.id } });
    if (existing) {
      throw new BadRequestException('Regra: já existe uma sala cadastrada para este professor.');
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const room = this.roomRepo.create({
      name,
      professorId: teacher.id,
      code,
    });

    const saved = await this.roomRepo.save(room);

    return {
      ok: true,
      room: { id: saved.id, name: saved.name, code: saved.code },
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
    };
  }

  async listRooms(schoolId: string) {
    const sid = String(schoolId || '').trim();
    if (!sid) throw new BadRequestException('schoolId é obrigatório.');

    // professores gerenciados desta escola
    const teachers = await this.userRepo.find({
      where: { role: 'professor' as any, schoolId: sid as any },
    });

    const teacherIds = teachers.map((t) => t.id);
    if (!teacherIds.length) return [];

    const rooms = await this.roomRepo.find({ where: { professorId: In(teacherIds) } });
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));

    return rooms.map((r) => {
      const t = teacherMap.get(r.professorId);
      return {
        id: r.id,
        name: r.name,
        code: r.code,
        professorId: r.professorId,
        teacherName: t?.name ?? '',
        teacherEmail: t?.email ?? '',
      };
    });
  }

  async roomAverage(roomId: string) {
    const rid = String(roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const tasks = await this.taskRepo.find({ where: { roomId: rid } });
    if (!tasks.length) return { ok: true, roomId: rid, average: null, count: 0 };

    const taskIds = tasks.map((t) => t.id);

    const essays = await this.essayRepo.find({
      where: { taskId: In(taskIds), isDraft: false as any },
    });

    const scores = essays
      .map((e: any) => (e.score == null ? null : Number(e.score)))
      .filter((n) => typeof n === 'number' && !Number.isNaN(n)) as number[];

    if (!scores.length) return { ok: true, roomId: rid, average: null, count: 0 };

    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    return { ok: true, roomId: rid, average: avg, count: scores.length };
  }
}
