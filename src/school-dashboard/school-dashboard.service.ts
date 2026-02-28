import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Not, Repository } from 'typeorm';

import { RoomEntity } from '../rooms/room.entity';
import { UserEntity } from '../users/user.entity';
import { SchoolYearEntity } from './school-year.entity';
import { RoomsService } from '../rooms/rooms.service';

function generateRoomCode() {
  // 6 chars, bem “humano”
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

@Injectable()
export class SchoolDashboardService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(SchoolYearEntity)
    private readonly yearRepo: Repository<SchoolYearEntity>,

    private readonly roomsService: RoomsService,
  ) {}

  private norm(v: any) {
    const s = String(v ?? '').trim();
    return s && s !== 'undefined' && s !== 'null' ? s : '';
  }

  private ensureUuid(v: any, field: string) {
    const s = this.norm(v);
    if (!s) throw new BadRequestException(`${field} é obrigatório.`);
    return s;
  }

  // ------------------------
  // Ano letivo
  // ------------------------
  async createYear(schoolId: string, name: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const n = this.norm(name);
    if (!n) throw new BadRequestException('name é obrigatório.');

    const year = this.yearRepo.create({
      schoolId: sid,
      name: n,
      isActive: true,
    });

    try {
      const saved = await this.yearRepo.save(year);
      return { ok: true, year: saved };
    } catch (e: any) {
      // unique (schoolId+name)
      throw new BadRequestException('Já existe um ano letivo com esse nome.');
    }
  }

  async listYears(schoolId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const years = await this.yearRepo.find({
      where: { schoolId: sid },
      order: { createdAt: 'DESC' as any },
    });
    return { ok: true, years };
  }

  async updateYear(schoolId: string, yearId: string, name?: string, isActive?: boolean) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const yid = this.ensureUuid(yearId, 'id');

    const year = await this.yearRepo.findOne({ where: { id: yid, schoolId: sid } });
    if (!year) throw new NotFoundException('Ano letivo não encontrado.');

    const patch: Partial<SchoolYearEntity> = {};
    if (name != null) {
      const n = this.norm(name);
      if (!n) throw new BadRequestException('name inválido.');
      patch.name = n;
    }
    if (isActive != null) patch.isActive = !!isActive;

    if (!Object.keys(patch).length) return { ok: true, year };

    try {
      await this.yearRepo.update({ id: yid }, patch);
    } catch {
      throw new BadRequestException('Já existe um ano letivo com esse nome.');
    }

    const updated = await this.yearRepo.findOne({ where: { id: yid } });
    return { ok: true, year: updated };
  }

  async deleteYear(schoolId: string, yearId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const yid = this.ensureUuid(yearId, 'id');

    const year = await this.yearRepo.findOne({ where: { id: yid, schoolId: sid } });
    if (!year) throw new NotFoundException('Ano letivo não encontrado.');

    // “desvincula” salas desse ano (não apaga salas)
    await this.roomRepo.update({ schoolId: sid, schoolYearId: yid }, { schoolYearId: null });

    await this.yearRepo.delete({ id: yid });
    return { ok: true };
  }

  // ------------------------
  // Salas (painel escolar)
  // ------------------------
  async createRoomForTeacherEmail(schoolId: string, roomName: string, teacherEmail: string, yearId?: string | null) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const name = this.norm(roomName);
    const email = this.norm(teacherEmail).toLowerCase();

    if (!name) throw new BadRequestException('name é obrigatório.');
    if (!email || !email.includes('@')) throw new BadRequestException('teacherEmail inválido.');

    // ✅ limite 10 salas por escola (ownerType=SCHOOL)
    const schoolRoomsCount = await this.roomRepo.count({
      where: { ownerType: 'SCHOOL', schoolId: sid } as FindOptionsWhere<RoomEntity>,
    });

    if (schoolRoomsCount >= 10) {
      throw new BadRequestException('Esta escola já atingiu o limite de 10 salas.');
    }

    // professor precisa existir e pertencer à escola
    const teacher = await this.userRepo.findOne({ where: { email } });
    if (!teacher) throw new NotFoundException('Professor não encontrado.');

    if (String(teacher.role || '').toLowerCase() !== 'professor') {
      throw new BadRequestException('O e-mail informado não é de professor.');
    }

    if (String((teacher as any).schoolId || '').trim() !== sid) {
      throw new ForbiddenException('Este professor não pertence a esta escola.');
    }

    // ano letivo (opcional) mas se vier, valida que é da escola
    let schoolYearId: string | null = null;
    if (yearId != null && String(yearId).trim()) {
      const yid = String(yearId).trim();
      const year = await this.yearRepo.findOne({ where: { id: yid, schoolId: sid } });
      if (!year) throw new BadRequestException('Ano letivo inválido para esta escola.');
      schoolYearId = yid;
    }

    // criar sala
    const room = this.roomRepo.create({
      name,
      professorId: teacher.id, // compat com sistema
      code: generateRoomCode(),
      ownerType: 'SCHOOL',
      schoolId: sid,
      teacherId: teacher.id,
      teacherNameSnapshot: teacher.name,
      schoolYearId,
    });

    // garante code único (se bater, tenta de novo)
    for (let i = 0; i < 5; i++) {
      try {
        const saved = await this.roomRepo.save(room);
        return {
          ok: true,
          room: {
            id: saved.id,
            name: saved.name,
            code: saved.code,
            teacherId: saved.teacherId,
            teacherNameSnapshot: saved.teacherNameSnapshot,
            schoolYearId: saved.schoolYearId,
            createdAt: saved.createdAt,
          },
        };
      } catch {
        room.code = generateRoomCode();
      }
    }

    throw new BadRequestException('Não foi possível gerar um código de sala. Tente novamente.');
  }

  async listRooms(schoolId: string, yearId?: string | null) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const y = yearId != null ? this.norm(yearId) : '';

    const where: FindOptionsWhere<RoomEntity> = {
      ownerType: 'SCHOOL',
      schoolId: sid,
    } as any;

    if (y) where.schoolYearId = y;

    const rooms = await this.roomRepo.find({
      where,
      order: { createdAt: 'DESC' as any },
    });

    return {
      ok: true,
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        teacherId: r.teacherId,
        teacherNameSnapshot: r.teacherNameSnapshot,
        schoolYearId: r.schoolYearId,
        createdAt: r.createdAt,
      })),
    };
  }

  async updateRoom(
    schoolId: string,
    roomId: string,
    patch: { name?: string; teacherEmail?: string; yearId?: string | null },
  ) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const rid = this.ensureUuid(roomId, 'id');

    const room = await this.roomRepo.findOne({ where: { id: rid, ownerType: 'SCHOOL', schoolId: sid } as any });
    if (!room) throw new NotFoundException('Sala não encontrada.');

    const upd: Partial<RoomEntity> = {};

    if (patch.name != null) {
      const n = this.norm(patch.name);
      if (!n) throw new BadRequestException('name inválido.');
      upd.name = n;
    }

    if (patch.teacherEmail != null) {
      const email = this.norm(patch.teacherEmail).toLowerCase();
      if (!email.includes('@')) throw new BadRequestException('teacherEmail inválido.');

      const teacher = await this.userRepo.findOne({ where: { email } });
      if (!teacher) throw new NotFoundException('Professor não encontrado.');

      if (String(teacher.role || '').toLowerCase() !== 'professor') {
        throw new BadRequestException('O e-mail informado não é de professor.');
      }

      if (String((teacher as any).schoolId || '').trim() !== sid) {
        throw new ForbiddenException('Este professor não pertence a esta escola.');
      }

      upd.teacherId = teacher.id;
      upd.teacherNameSnapshot = teacher.name;
      upd.professorId = teacher.id; // compat
    }

    if (patch.yearId !== undefined) {
      const y = patch.yearId == null ? '' : String(patch.yearId).trim();
      if (!y) {
        upd.schoolYearId = null;
      } else {
        const year = await this.yearRepo.findOne({ where: { id: y, schoolId: sid } });
        if (!year) throw new BadRequestException('Ano letivo inválido para esta escola.');
        upd.schoolYearId = y;
      }
    }

    if (!Object.keys(upd).length) return { ok: true, room };

    await this.roomRepo.update({ id: rid }, upd);

    const updated = await this.roomRepo.findOne({ where: { id: rid } });
    return {
      ok: true,
      room: {
        id: updated!.id,
        name: updated!.name,
        code: updated!.code,
        teacherId: updated!.teacherId,
        teacherNameSnapshot: updated!.teacherNameSnapshot,
        schoolYearId: updated!.schoolYearId,
        createdAt: updated!.createdAt,
      },
    };
  }

  async deleteRoom(schoolId: string, roomId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const rid = this.ensureUuid(roomId, 'id');

    const room = await this.roomRepo.findOne({ where: { id: rid, ownerType: 'SCHOOL', schoolId: sid } as any });
    if (!room) throw new NotFoundException('Sala não encontrada.');

    // ⚠️ Aqui você pode decidir o que acontece com tasks/enrollments/essays:
    // - manter (histórico) ou deletar cascata.
    // Por enquanto: deleta só a sala (se tiver FK sem cascade, vai falhar).
    await this.roomRepo.delete({ id: rid });
    return { ok: true };
  }

  /**
   * ✅ "Visualizar" -> Overview com média geral
   * Vou reaproveitar RoomsService.overview(roomId),
   * que você já tem no painel do professor.
   */
  async roomOverview(schoolId: string, roomId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const rid = this.ensureUuid(roomId, 'id');

    const room = await this.roomRepo.findOne({ where: { id: rid, ownerType: 'SCHOOL', schoolId: sid } as any });
    if (!room) throw new NotFoundException('Sala não encontrada.');

    const overview = await this.roomsService.overview(rid);

    return {
      ok: true,
      room: {
        id: room.id,
        name: room.name,
        code: room.code,
        teacherNameSnapshot: room.teacherNameSnapshot,
        teacherId: room.teacherId,
        schoolYearId: room.schoolYearId,
        createdAt: room.createdAt,
      },
      overview,
    };
  }
}
