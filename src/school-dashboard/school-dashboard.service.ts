import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { UserEntity } from '../users/user.entity';
import { RoomEntity } from '../rooms/room.entity';
import { TaskEntity } from '../tasks/task.entity';
import { EssayEntity } from '../essays/essay.entity';

@Injectable()
export class SchoolDashboardService {
  constructor(
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoomEntity) private readonly roomRepo: Repository<RoomEntity>,
    @InjectRepository(TaskEntity) private readonly taskRepo: Repository<TaskEntity>,
    @InjectRepository(EssayEntity) private readonly essayRepo: Repository<EssayEntity>,
  ) {}

  private mean(nums: number[]) {
    if (!nums.length) return null;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    return Math.round(avg);
  }

  async roomsSummary(schoolId: string) {
    const school = await this.userRepo.findOne({ where: { id: schoolId } });
    if (!school) throw new NotFoundException('Escola não encontrada.');

    // professores vinculados à escola
    const teachers = await this.userRepo.find({
      where: {
        role: 'professor',
        schoolId,
      } as any,
    });

    const teacherIds = teachers.map((t) => t.id);
    if (!teacherIds.length) {
      return { ok: true, school: { id: school.id, name: school.name, email: school.email }, rooms: [] };
    }

    // salas desses professores
    const rooms = await this.roomRepo.find({
      where: { professorId: In(teacherIds) } as any,
      order: { createdAt: 'DESC' as any },
    });

    if (!rooms.length) {
      return { ok: true, school: { id: school.id, name: school.name, email: school.email }, rooms: [] };
    }

    // tasks por sala
    const roomIds = rooms.map((r) => r.id);
    const tasks = await this.taskRepo.find({ where: { roomId: In(roomIds) } as any });
    const taskIds = tasks.map((t) => t.id);

    // essays corrigidas (score != null), sem rascunho
    const essays = taskIds.length
      ? await this.essayRepo.find({ where: { taskId: In(taskIds), isDraft: false } as any })
      : [];

    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const taskRoomMap = new Map(tasks.map((t) => [t.id, t.roomId]));

    // agrupa scores por room
    const scoresByRoom = new Map<string, number[]>();
    for (const e of essays) {
      const score = (e as any).score;
      if (score == null) continue;
      const rid = taskRoomMap.get((e as any).taskId);
      if (!rid) continue;
      const arr = scoresByRoom.get(rid) || [];
      arr.push(Number(score));
      scoresByRoom.set(rid, arr);
    }

    const result = rooms.map((room) => {
      const prof = teacherMap.get((room as any).professorId);
      const scores = scoresByRoom.get(room.id) || [];
      return {
        roomId: room.id,
        roomName: (room as any).name || 'Sala',
        teacherId: (prof as any)?.id || null,
        teacherName: (prof as any)?.name || '',
        teacherEmail: (prof as any)?.email || '',
        avgScore: this.mean(scores),
      };
    });

    return {
      ok: true,
      school: { id: school.id, name: school.name, email: school.email },
      rooms: result,
    };
  }

  /**
   * ✅ Regra: escola só pode cadastrar UMA sala para cada professor.
   * - Localiza professor pelo e-mail
   * - Verifica se ele pertence à escola (schoolId)
   * - Verifica se já existe sala com professorId
   */
  async createRoomForTeacherEmail(schoolId: string, roomName: string, teacherEmail: string) {
    const teacher = await this.userRepo.findOne({ where: { email: teacherEmail } });
    if (!teacher) throw new NotFoundException('Professor não encontrado.');

    if (String((teacher as any).role || '').toLowerCase() !== 'professor') {
      throw new BadRequestException('O e-mail informado não é de professor.');
    }

    if (String((teacher as any).schoolId || '') !== String(schoolId)) {
      throw new BadRequestException('Este professor não pertence a esta escola.');
    }

    const existing = await this.roomRepo.findOne({
      where: { professorId: teacher.id } as any,
    });

    if (existing) {
      throw new BadRequestException('Este professor já possui uma sala cadastrada.');
    }

    const room = this.roomRepo.create({
      name: roomName,
      professorId: teacher.id,
    } as any);

    const saved = await this.roomRepo.save(room);

    return { ok: true, room: saved };
  }
}