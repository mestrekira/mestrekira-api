import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

import { RoomEntity } from '../rooms/room.entity';
import { UserEntity } from '../users/user.entity';
import { SchoolYearEntity } from './school-year.entity';
import { RoomsService } from '../rooms/rooms.service';
import { MailService } from '../mail/mail.service';
import { EssaysService } from '../essays/essays.service';

function generateRoomCode() {
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
    private readonly mailService: MailService,
    private readonly essaysService: EssaysService,
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

  private roleOf(user: any) {
    return String(user?.role || '').trim().toLowerCase();
  }

  private newTempPassword() {
    return crypto.randomBytes(6).toString('base64url');
  }

  private getWebUrl() {
    return (
      (process.env.APP_WEB_URL || '').trim() ||
      'https://www.mestrekira.com.br/app/frontend'
    );
  }

  private toNumOrNull(v: any) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }

  private mean(nums: any[]) {
    const arr = (Array.isArray(nums) ? nums : [])
      .map((n) => this.toNumOrNull(n))
      .filter((n) => typeof n === 'number') as number[];

    if (!arr.length) return null;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
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
    } catch {
      throw new BadRequestException('Já existe um ano letivo com esse nome.');
    }
  }

  async listYears(schoolId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');

    const years = await this.yearRepo.find({
      where: { schoolId: sid },
      order: ({ createdAt: 'DESC' } as any),
    });

    return { ok: true, years };
  }

  async updateYear(
    schoolId: string,
    yearId: string,
    name?: string,
    isActive?: boolean,
  ) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const yid = this.ensureUuid(yearId, 'id');

    const year = await this.yearRepo.findOne({
      where: { id: yid, schoolId: sid },
    });
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

    const year = await this.yearRepo.findOne({
      where: { id: yid, schoolId: sid },
    });
    if (!year) throw new NotFoundException('Ano letivo não encontrado.');

    await this.roomRepo.update(
      { schoolId: sid, schoolYearId: yid } as any,
      { schoolYearId: null } as any,
    );

    await this.yearRepo.delete({ id: yid });
    return { ok: true };
  }

  // ------------------------
  // Salas
  // ------------------------

  async deleteRoom(schoolId: string, roomId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const rid = this.ensureUuid(roomId, 'id');

    const room = await this.roomRepo.findOne({
      where: { id: rid, ownerType: 'SCHOOL', schoolId: sid } as any,
    });

    if (!room) throw new NotFoundException('Sala não encontrada.');

    // 🔥 CORREÇÃO IMPORTANTE: agora com cascade real
    await this.roomsService.deleteRoomCascade(rid);

    return { ok: true };
  }

  // ------------------------
  // EXCLUSÃO DA CONTA DA ESCOLA
  // ------------------------

  async deleteMyAccount(schoolId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');

    const school = await this.userRepo.findOne({
      where: { id: sid },
    });

    if (!school) {
      throw new NotFoundException('Escola não encontrada.');
    }

    if (this.roleOf(school) !== 'school') {
      throw new ForbiddenException('Usuário não é uma escola.');
    }

    // 1. Buscar salas
    const rooms = await this.roomRepo.find({
      where: {
        ownerType: 'SCHOOL',
        schoolId: sid,
      } as any,
      select: ['id'],
    });

    // 2. Cascade real
    for (const room of rooms) {
      await this.roomsService.deleteRoomCascade(room.id);
    }

    // 3. Remover professores da escola
    await this.userRepo.delete({
      role: 'professor',
      schoolId: sid,
    } as any);

    // 4. Remover anos letivos
    await this.yearRepo.delete({
      schoolId: sid,
    });

    // 5. Remover escola
    await this.userRepo.delete({ id: sid });

    return {
      ok: true,
      message: 'Conta da escola excluída com sucesso.',
    };
  }

  // ------------------------
  // Overview
  // ------------------------

  async roomOverview(schoolId: string, roomId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const rid = this.ensureUuid(roomId, 'id');

    const room = await this.roomRepo.findOne({
      where: { id: rid, ownerType: 'SCHOOL', schoolId: sid } as any,
    });

    if (!room) throw new NotFoundException('Sala não encontrada.');

    const year = room.schoolYearId
      ? await this.yearRepo.findOne({
          where: { id: room.schoolYearId, schoolId: sid },
        })
      : null;

    const overview = await this.roomsService.overview(rid);

    const performance = await this.essaysService.performanceByRoom(rid);

    const corrected = (Array.isArray(performance) ? performance : []).filter(
      (e) => e?.score !== null && e?.score !== undefined,
    );

    const mTotal = this.mean(corrected.map((e) => e.score));
    const mC1 = this.mean(corrected.map((e) => e.c1));
    const mC2 = this.mean(corrected.map((e) => e.c2));
    const mC3 = this.mean(corrected.map((e) => e.c3));
    const mC4 = this.mean(corrected.map((e) => e.c4));
    const mC5 = this.mean(corrected.map((e) => e.c5));

    const students = Array.isArray((overview as any)?.students)
      ? (overview as any).students
      : [];

    return {
      ok: true,
      room: {
        id: room.id,
        name: room.name,
        code: room.code,
        teacherNameSnapshot: room.teacherNameSnapshot,
        teacherId: room.teacherId,
        schoolYearId: room.schoolYearId,
        yearName: year?.name ?? null,
        createdAt: (room as any).createdAt ?? null,
      },
      overview: {
        ...(overview || {}),
        studentsCount: students.length,
      },
      performance: {
        correctedCount: corrected.length,
        averages: {
          total: mTotal,
          c1: mC1,
          c2: mC2,
          c3: mC3,
          c4: mC4,
          c5: mC5,
        },
      },
    };
  }
}
