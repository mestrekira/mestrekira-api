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
  // Salas (painel escolar)
  // ------------------------
  async createRoomForTeacherEmail(
    schoolId: string,
    roomName: string,
    teacherEmail: string,
    yearId: string,
    teacherName?: string,
  ) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const name = this.norm(roomName);
    const email = this.norm(teacherEmail).toLowerCase();
    const yid = this.ensureUuid(yearId, 'yearId');
    const teacherNameNormalized = this.norm(teacherName);

    if (!name) throw new BadRequestException('name é obrigatório.');
    if (!email || !email.includes('@')) {
      throw new BadRequestException('teacherEmail inválido.');
    }

    const school = await this.userRepo.findOne({ where: { id: sid } });
    if (!school) throw new NotFoundException('Escola não encontrada.');
    if (this.roleOf(school) !== 'school') {
      throw new ForbiddenException('Apenas escolas podem criar salas.');
    }

    const year = await this.yearRepo.findOne({
      where: { id: yid, schoolId: sid },
    });
    if (!year) {
      throw new BadRequestException('Ano letivo inválido para esta escola.');
    }

    const schoolRoomsCount = await this.roomRepo.count({
      where: {
        ownerType: 'SCHOOL',
        schoolId: sid,
      } as FindOptionsWhere<RoomEntity>,
    });

    if (schoolRoomsCount >= 10) {
      throw new BadRequestException(
        'Esta escola já atingiu o limite de 10 salas.',
      );
    }

    let teacher: UserEntity | null = await this.userRepo.findOne({
      where: { email },
    });

    let generatedTempPassword: string | null = null;
    let teacherWasProvisioned = false;
    let teacherCreatedNow = false;

    if (!teacher) {
      generatedTempPassword = this.newTempPassword();
      const passwordHash = await bcrypt.hash(generatedTempPassword, 10);

      const createdTeacher = new UserEntity();
      createdTeacher.name = teacherNameNormalized || email.split('@')[0];
      createdTeacher.email = email;
      createdTeacher.password = passwordHash;
      createdTeacher.role = 'professor';

      (createdTeacher as any).professorType = 'SCHOOL';
      (createdTeacher as any).schoolId = sid;
      (createdTeacher as any).mustChangePassword = true;
      (createdTeacher as any).trialMode = false;
      (createdTeacher as any).isActive = true;

      (createdTeacher as any).emailVerified = true;
      (createdTeacher as any).emailVerifiedAt = new Date();
      (createdTeacher as any).emailVerifyTokenHash = null;
      (createdTeacher as any).emailVerifyTokenExpiresAt = null;

      const savedTeacher = await this.userRepo.save(createdTeacher);
      teacher = savedTeacher;
      teacherWasProvisioned = true;
      teacherCreatedNow = true;
    } else {
      if (this.roleOf(teacher) !== 'professor') {
        throw new BadRequestException(
          'Este e-mail já está cadastrado como outro tipo de usuário.',
        );
      }

      const teacherSchoolId = String((teacher as any).schoolId || '').trim();

      if (teacherSchoolId && teacherSchoolId !== sid) {
        throw new ForbiddenException(
          'Este professor já está vinculado a outra escola.',
        );
      }

      const professorType = String(
        (teacher as any).professorType || '',
      ).toUpperCase();

      if (teacherSchoolId !== sid || professorType !== 'SCHOOL') {
        generatedTempPassword = this.newTempPassword();
        const passwordHash = await bcrypt.hash(generatedTempPassword, 10);

        teacher.name =
          teacher.name ||
          teacherNameNormalized ||
          email.split('@')[0];
        (teacher as any).professorType = 'SCHOOL';
        (teacher as any).schoolId = sid;
        (teacher as any).mustChangePassword = true;
        (teacher as any).isActive = true;
        teacher.password = passwordHash;

        (teacher as any).emailVerified = true;
        (teacher as any).emailVerifiedAt = new Date();
        (teacher as any).emailVerifyTokenHash = null;
        (teacher as any).emailVerifyTokenExpiresAt = null;

        const savedTeacher: UserEntity = await this.userRepo.save(teacher);
        teacher = savedTeacher;
        teacherWasProvisioned = true;
      }
    }

    if (!teacher) {
      throw new BadRequestException('Não foi possível preparar o professor.');
    }

    const room = this.roomRepo.create({
      name,
      professorId: teacher.id,
      code: generateRoomCode(),
      ownerType: 'SCHOOL',
      schoolId: sid,
      teacherId: teacher.id,
      teacherNameSnapshot: teacher.name,
      schoolYearId: yid,
      isActive: true,
      deactivatedAt: null,
    });

    let savedRoom: RoomEntity | null = null;
    let lastError: any = null;

    for (let i = 0; i < 5; i++) {
      try {
        savedRoom = await this.roomRepo.save(room);
        break;
      } catch (e: any) {
        lastError = e;

        if (e?.code === '23505') {
          const detail = String(e?.detail || e?.message || '').toLowerCase();

          if (detail.includes('code')) {
            room.code = generateRoomCode();
            continue;
          }

          throw new BadRequestException(
            'Conflito de dados ao criar a sala. Verifique os dados informados.',
          );
        }

        throw new BadRequestException(
          `Falha ao salvar a sala: ${e?.message || 'erro desconhecido'}`,
        );
      }
    }

    if (!savedRoom) {
      throw new BadRequestException(
        `Não foi possível salvar a sala. ${
          lastError?.message ? `Detalhe: ${lastError.message}` : ''
        }`.trim(),
      );
    }

    if (teacherCreatedNow && generatedTempPassword) {
      const loginUrl = `${this.getWebUrl()}/login-professor.html`;

      await this.mailService.sendSchoolTeacherAccess({
        to: teacher.email,
        teacherName: teacher.name,
        schoolName: school.name,
        temporaryPassword: generatedTempPassword,
        loginUrl,
        roomName: name,
        roomCode: savedRoom.code,
        yearName: year.name,
      });
    }

    return {
      ok: true,
      room: {
        id: savedRoom.id,
        name: savedRoom.name,
        code: savedRoom.code,
        teacherId: savedRoom.teacherId,
        teacherNameSnapshot: savedRoom.teacherNameSnapshot,
        schoolYearId: savedRoom.schoolYearId,
        createdAt: (savedRoom as any).createdAt ?? null,
      },
      teacher: {
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
        professorType: (teacher as any).professorType ?? null,
        schoolId: (teacher as any).schoolId ?? null,
        mustChangePassword: !!(teacher as any).mustChangePassword,
        createdOrUpdated: teacherWasProvisioned,
        emailSent: !!(teacherCreatedNow && generatedTempPassword),
      },
    };
  }

  async listRooms(schoolId: string, yearId?: string | null) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const y = yearId != null ? this.norm(yearId) : '';

    const where: FindOptionsWhere<RoomEntity> = {
      ownerType: 'SCHOOL',
      schoolId: sid,
    } as any;

    if (y) where.schoolYearId = y as any;

    const rooms = await this.roomRepo.find({
      where,
      order: ({ createdAt: 'DESC' } as any),
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
        createdAt: (r as any).createdAt ?? null,
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

    const room = await this.roomRepo.findOne({
      where: { id: rid, ownerType: 'SCHOOL', schoolId: sid } as any,
    });
    if (!room) throw new NotFoundException('Sala não encontrada.');

    const upd: Partial<RoomEntity> = {};

    if (patch.name != null) {
      const n = this.norm(patch.name);
      if (!n) throw new BadRequestException('name inválido.');
      upd.name = n;
    }

    if (patch.teacherEmail != null) {
      const email = this.norm(patch.teacherEmail).toLowerCase();
      if (!email.includes('@')) {
        throw new BadRequestException('teacherEmail inválido.');
      }

      const teacher = await this.userRepo.findOne({ where: { email } });
      if (!teacher) throw new NotFoundException('Professor não encontrado.');

      if (this.roleOf(teacher) !== 'professor') {
        throw new BadRequestException('O e-mail informado não é de professor.');
      }

      if (String((teacher as any).schoolId || '').trim() !== sid) {
        throw new ForbiddenException(
          'Este professor não pertence a esta escola.',
        );
      }

      upd.teacherId = teacher.id;
      upd.teacherNameSnapshot = teacher.name;
      upd.professorId = teacher.id;
    }

    if (patch.yearId !== undefined) {
      const y = patch.yearId == null ? '' : String(patch.yearId).trim();
      if (!y) {
        upd.schoolYearId = null;
      } else {
        const year = await this.yearRepo.findOne({
          where: { id: y, schoolId: sid },
        });
        if (!year) {
          throw new BadRequestException('Ano letivo inválido para esta escola.');
        }
        upd.schoolYearId = y;
      }
    }

    if (!Object.keys(upd).length) return { ok: true, room };

    await this.roomRepo.update({ id: rid } as any, upd as any);

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
        createdAt: (updated as any)?.createdAt ?? null,
      },
    };
  }

  async deleteRoom(schoolId: string, roomId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const rid = this.ensureUuid(roomId, 'id');

    const room = await this.roomRepo.findOne({
      where: { id: rid, ownerType: 'SCHOOL', schoolId: sid } as any,
    });

    if (!room) throw new NotFoundException('Sala não encontrada.');

    await this.roomsService.deleteRoomCascade(rid);

    return { ok: true };
  }

  // ------------------------
  // Exclusão da conta da escola
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

    const rooms = await this.roomRepo.find({
      where: {
        ownerType: 'SCHOOL',
        schoolId: sid,
      } as any,
      select: ['id'],
    });

    for (const room of rooms) {
      await this.roomsService.deleteRoomCascade(room.id);
    }

    await this.userRepo.delete({
      role: 'professor',
      schoolId: sid,
    } as any);

    await this.yearRepo.delete({
      schoolId: sid,
    });

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
