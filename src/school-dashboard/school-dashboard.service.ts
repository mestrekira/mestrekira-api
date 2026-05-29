```ts
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

  private parseOptionalBoolean(v: any): boolean | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    if (v === true || v === false) return v;
    if (v === 1 || v === '1') return true;
    if (v === 0 || v === '0') return false;

    const s = String(v).trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;

    throw new BadRequestException('isActive inválido.');
  }

  private getRoomTeacherId(room: RoomEntity) {
    return String(
      (room as any).teacherId || (room as any).professorId || '',
    ).trim();
  }

  private async findSchoolTeacherOrFail(schoolId: string, teacherId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const tid = this.ensureUuid(teacherId, 'teacherId');

    const teacher = await this.userRepo.findOne({
      where: {
        id: tid,
        role: 'professor',
        schoolId: sid,
      } as any,
    });

    if (!teacher) {
      throw new NotFoundException('Professor da escola não encontrado.');
    }

    if (this.roleOf(teacher) !== 'professor') {
      throw new ForbiddenException('Usuário informado não é professor.');
    }

    if (String((teacher as any).schoolId || '').trim() !== sid) {
      throw new ForbiddenException(
        'Professor não pertence à escola informada.',
      );
    }

    return teacher;
  }

  private async getSchoolTeacherRooms(schoolId: string, teacherId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const tid = this.ensureUuid(teacherId, 'teacherId');

    const rooms = await this.roomRepo.find({
      where: {
        ownerType: 'SCHOOL',
        schoolId: sid,
      } as any,
      order: { name: 'ASC' } as any,
    });

    return rooms.filter((room) => {
      const t1 = String((room as any).teacherId || '').trim();
      const t2 = String((room as any).professorId || '').trim();

      return t1 === tid || t2 === tid;
    });
  }

  private async resolveSchoolTeacher(
    schoolId: string,
    teacherEmail: string,
    teacherName?: string,
  ): Promise<{
    teacher: UserEntity;
    generatedTempPassword: string | null;
    teacherWasProvisioned: boolean;
    teacherCreatedNow: boolean;
  }> {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const email = this.norm(teacherEmail).toLowerCase();
    const teacherNameNormalized = this.norm(teacherName);

    if (!email || !email.includes('@')) {
      throw new BadRequestException('teacherEmail inválido.');
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

      createdTeacher.professorType = 'SCHOOL';
      createdTeacher.schoolId = sid;
      createdTeacher.mustChangePassword = true;
      createdTeacher.trialMode = false;
      createdTeacher.isActive = true;

      createdTeacher.emailVerified = true;
      createdTeacher.emailVerifiedAt = new Date();
      createdTeacher.emailVerifyTokenHash = null;
      createdTeacher.emailVerifyTokenExpiresAt = null;

      teacher = await this.userRepo.save(createdTeacher);
      teacherWasProvisioned = true;
      teacherCreatedNow = true;
    } else {
      if (this.roleOf(teacher) !== 'professor') {
        throw new BadRequestException(
          'Este e-mail já está cadastrado como outro tipo de usuário.',
        );
      }

      const teacherSchoolId = String(teacher.schoolId || '').trim();

      if (teacherSchoolId && teacherSchoolId !== sid) {
        throw new ForbiddenException(
          'Este professor já está vinculado a outra escola.',
        );
      }

      const professorType = String(teacher.professorType || '').toUpperCase();

      let mustSaveTeacher = false;

      if (teacherNameNormalized && teacher.name !== teacherNameNormalized) {
        teacher.name = teacherNameNormalized;
        mustSaveTeacher = true;
      } else if (!teacher.name) {
        teacher.name = email.split('@')[0];
        mustSaveTeacher = true;
      }

      if (teacherSchoolId !== sid || professorType !== 'SCHOOL') {
        generatedTempPassword = this.newTempPassword();
        const passwordHash = await bcrypt.hash(generatedTempPassword, 10);

        teacher.password = passwordHash;
        teacher.professorType = 'SCHOOL';
        teacher.schoolId = sid;
        teacher.mustChangePassword = true;
        teacher.trialMode = false;
        teacher.isActive = true;

        teacher.emailVerified = true;
        teacher.emailVerifiedAt = new Date();
        teacher.emailVerifyTokenHash = null;
        teacher.emailVerifyTokenExpiresAt = null;

        mustSaveTeacher = true;
        teacherWasProvisioned = true;
      }

      if (teacher.isActive === false) {
        teacher.isActive = true;
        mustSaveTeacher = true;
      }

      if (mustSaveTeacher) {
        teacher = await this.userRepo.save(teacher);
      }
    }

    if (!teacher) {
      throw new BadRequestException('Não foi possível preparar o professor.');
    }

    return {
      teacher,
      generatedTempPassword,
      teacherWasProvisioned,
      teacherCreatedNow,
    };
  }

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
      order: { createdAt: 'DESC' } as any,
    });

    return { ok: true, years };
  }

  async updateYear(
    schoolId: string,
    yearId: string,
    name?: string,
    isActive?: any,
  ) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const yid = this.ensureUuid(yearId, 'id');

    const year = await this.yearRepo.findOne({
      where: { id: yid, schoolId: sid },
    });

    if (!year) throw new NotFoundException('Ano letivo não encontrado.');

    let changed = false;

    if (name != null) {
      const n = this.norm(name);
      if (!n) throw new BadRequestException('name inválido.');

      if (year.name !== n) {
        year.name = n;
        changed = true;
      }
    }

    const parsedIsActive = this.parseOptionalBoolean(isActive);

    if (parsedIsActive !== undefined && year.isActive !== parsedIsActive) {
      year.isActive = parsedIsActive;
      changed = true;
    }

    if (!changed) {
      return { ok: true, year };
    }

    try {
      const saved = await this.yearRepo.save(year);

      const reloaded = await this.yearRepo.findOne({
        where: { id: yid, schoolId: sid },
      });

      return { ok: true, year: reloaded ?? saved };
    } catch {
      throw new BadRequestException('Já existe um ano letivo com esse nome.');
    }
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

    const school = await this.userRepo.findOne({
      where: { id: sid },
    });

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

    if (year.isActive === false) {
      throw new BadRequestException(
        'Este ano letivo está inativo e não permite novas salas.',
      );
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

    const {
      teacher,
      generatedTempPassword,
      teacherWasProvisioned,
      teacherCreatedNow,
    } = await this.resolveSchoolTeacher(sid, email, teacherNameNormalized);

    const room = this.roomRepo.create({
      name,
      professorId: teacher.id,
      code: generateRoomCode(),
      ownerType: 'SCHOOL',
      schoolId: sid,
      teacherId: teacher.id,
      teacherNameSnapshot: teacherNameNormalized || teacher.name,
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

    if (generatedTempPassword) {
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
        isActive: savedRoom.isActive,
        deactivatedAt: (savedRoom as any).deactivatedAt ?? null,
        createdAt: (savedRoom as any).createdAt ?? null,
      },
      teacher: {
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
        professorType: teacher.professorType ?? null,
        schoolId: teacher.schoolId ?? null,
        mustChangePassword: !!teacher.mustChangePassword,
        createdOrUpdated: teacherWasProvisioned,
        createdNow: teacherCreatedNow,
        emailSent: !!generatedTempPassword,
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

    if (y) {
      where.schoolYearId = y as any;
    }

    const rooms = await this.roomRepo.find({
      where,
      order: { createdAt: 'DESC' } as any,
    });

    const teacherIds = Array.from(
      new Set(
        rooms
          .map((r) => this.getRoomTeacherId(r))
          .filter(Boolean),
      ),
    );

    const teachers = teacherIds.length
      ? await this.userRepo.find({
          where: teacherIds.map((id) => ({ id })) as any,
          select: ['id', 'email'],
        })
      : [];

    const teacherEmailMap = new Map(
      teachers.map((t) => [String(t.id), t.email]),
    );

    return {
      ok: true,
      rooms: rooms.map((r) => {
        const teacherId = this.getRoomTeacherId(r);

        return {
          id: r.id,
          name: r.name,
          code: r.code,
          teacherId: r.teacherId,
          teacherNameSnapshot: r.teacherNameSnapshot,
          teacherEmail: teacherEmailMap.get(teacherId) || '',
          schoolYearId: r.schoolYearId,
          isActive: r.isActive,
          deactivatedAt: (r as any).deactivatedAt ?? null,
          createdAt: (r as any).createdAt ?? null,
        };
      }),
    };
  }

  async listSchoolTeachers(schoolId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');

    const teachers = await this.userRepo.find({
      where: {
        role: 'professor',
        schoolId: sid,
      } as any,
      order: { name: 'ASC' } as any,
    });

    const rooms = await this.roomRepo.find({
      where: {
        ownerType: 'SCHOOL',
        schoolId: sid,
      } as any,
      order: { name: 'ASC' } as any,
    });

    const roomsByTeacher = new Map<string, RoomEntity[]>();

    for (const room of rooms) {
      const ids = Array.from(
        new Set(
          [
            String((room as any).teacherId || '').trim(),
            String((room as any).professorId || '').trim(),
          ].filter(Boolean),
        ),
      );

      for (const teacherId of ids) {
        if (!roomsByTeacher.has(teacherId)) {
          roomsByTeacher.set(teacherId, []);
        }

        roomsByTeacher.get(teacherId)!.push(room);
      }
    }

    const mapped = teachers.map((teacher) => {
      const teacherRooms = roomsByTeacher.get(String(teacher.id)) || [];

      const activeRooms = teacherRooms.filter(
        (room) => room.isActive !== false,
      ).length;

      const inactiveRooms = teacherRooms.filter(
        (room) => room.isActive === false,
      ).length;

      const roomsTotal = teacherRooms.length;
      const isActive = teacher.isActive !== false;

      return {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        isActive,
        professorType: teacher.professorType ?? null,
        schoolId: teacher.schoolId ?? null,
        mustChangePassword: !!teacher.mustChangePassword,
        roomsTotal,
        activeRooms,
        inactiveRooms,
        canDeactivate: isActive && activeRooms === 0,
        canDelete: roomsTotal === 0,
        rooms: teacherRooms.map((room) => ({
          id: room.id,
          name: room.name,
          isActive: room.isActive !== false,
        })),
      };
    });

    return {
      ok: true,
      teachers: mapped,
    };
  }

  async deactivateSchoolTeacher(schoolId: string, teacherId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const teacher = await this.findSchoolTeacherOrFail(sid, teacherId);
    const rooms = await this.getSchoolTeacherRooms(sid, teacher.id);

    const activeRooms = rooms.filter((room) => room.isActive !== false).length;

    if (activeRooms > 0) {
      throw new BadRequestException(
        'Não é possível desativar este professor porque ele ainda possui sala ativa vinculada.',
      );
    }

    teacher.isActive = false;

    const saved = await this.userRepo.save(teacher);

    return {
      ok: true,
      teacher: {
        id: saved.id,
        name: saved.name,
        email: saved.email,
        isActive: saved.isActive !== false,
        professorType: saved.professorType ?? null,
        schoolId: saved.schoolId ?? null,
        mustChangePassword: !!saved.mustChangePassword,
      },
    };
  }

  async deleteSchoolTeacher(schoolId: string, teacherId: string) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const teacher = await this.findSchoolTeacherOrFail(sid, teacherId);
    const rooms = await this.getSchoolTeacherRooms(sid, teacher.id);

    if (rooms.length > 0) {
      throw new BadRequestException(
        'Não é possível excluir este professor porque ainda existem salas vinculadas a ele. Desative o professor, se ele não tiver salas ativas.',
      );
    }

    await this.userRepo.delete({ id: teacher.id });

    return {
      ok: true,
      message: 'Professor excluído com sucesso.',
    };
  }

  async updateRoom(
    schoolId: string,
    roomId: string,
    patch: {
      name?: string;
      teacherName?: string;
      teacherEmail?: string;
      yearId?: string | null;
      isActive?: boolean;
    },
  ) {
    const sid = this.ensureUuid(schoolId, 'schoolId');
    const rid = this.ensureUuid(roomId, 'id');

    const room = await this.roomRepo.findOne({
      where: { id: rid, ownerType: 'SCHOOL', schoolId: sid } as any,
    });

    if (!room) throw new NotFoundException('Sala não encontrada.');

    const school = await this.userRepo.findOne({
      where: { id: sid },
    });

    if (!school) throw new NotFoundException('Escola não encontrada.');

    const upd: Partial<RoomEntity> = {};

    let effectiveRoomName = room.name;
    let effectiveYearName = '';

    if (room.schoolYearId) {
      const currentYear = await this.yearRepo.findOne({
        where: { id: room.schoolYearId, schoolId: sid },
      });

      effectiveYearName = currentYear?.name || '';
    }

    if (patch.name != null) {
      const n = this.norm(patch.name);
      if (!n) throw new BadRequestException('name inválido.');

      upd.name = n;
      effectiveRoomName = n;
    }

    if (patch.yearId !== undefined) {
      const y = patch.yearId == null ? '' : String(patch.yearId).trim();

      if (!y) {
        upd.schoolYearId = null;
        effectiveYearName = '';
      } else {
        const year = await this.yearRepo.findOne({
          where: { id: y, schoolId: sid },
        });

        if (!year) {
          throw new BadRequestException('Ano letivo inválido para esta escola.');
        }

        if (year.isActive === false) {
          throw new BadRequestException(
            'Este ano letivo está inativo e não pode ser vinculado à sala.',
          );
        }

        upd.schoolYearId = y;
        effectiveYearName = year.name;
      }
    }

    if (patch.teacherEmail != null) {
      const email = this.norm(patch.teacherEmail).toLowerCase();

      if (!email || !email.includes('@')) {
        throw new BadRequestException('teacherEmail inválido.');
      }

      const teacherNameNormalized = this.norm(patch.teacherName);

      const {
        teacher,
        generatedTempPassword,
        teacherWasProvisioned,
        teacherCreatedNow,
      } = await this.resolveSchoolTeacher(
        sid,
        email,
        teacherNameNormalized,
      );

      upd.teacherId = teacher.id;
      upd.professorId = teacher.id;
      upd.teacherNameSnapshot = teacherNameNormalized || teacher.name;

      if (generatedTempPassword) {
        const loginUrl = `${this.getWebUrl()}/login-professor.html`;

        await this.mailService.sendSchoolTeacherAccess({
          to: teacher.email,
          teacherName: teacher.name,
          schoolName: school.name,
          temporaryPassword: generatedTempPassword,
          loginUrl,
          roomName: effectiveRoomName,
          roomCode: room.code,
          yearName: effectiveYearName,
        });
      }

      (upd as any).__teacherMeta = {
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
        professorType: teacher.professorType ?? null,
        schoolId: teacher.schoolId ?? null,
        mustChangePassword: !!teacher.mustChangePassword,
        createdOrUpdated: teacherWasProvisioned,
        createdNow: teacherCreatedNow,
        emailSent: !!generatedTempPassword,
      };
    } else if (patch.teacherName != null) {
      const teacherNameNormalized = this.norm(patch.teacherName);

      if (teacherNameNormalized) {
        const currentTeacherId = String(
          (room as any).teacherId || (room as any).professorId || '',
        ).trim();

        if (currentTeacherId) {
          const teacher = await this.userRepo.findOne({
            where: { id: currentTeacherId },
          });

          if (
            teacher &&
            this.roleOf(teacher) === 'professor' &&
            String(teacher.schoolId || '').trim() === sid
          ) {
            teacher.name = teacherNameNormalized;
            await this.userRepo.save(teacher);
          }
        }

        upd.teacherNameSnapshot = teacherNameNormalized;
      }
    }

    if (patch.isActive != null) {
      const nextIsActive = !!patch.isActive;
      upd.isActive = nextIsActive;
      upd.deactivatedAt = nextIsActive ? null : new Date();
    }

    const teacherMeta = (upd as any).__teacherMeta;
    delete (upd as any).__teacherMeta;

    if (!Object.keys(upd).length) {
      return { ok: true, room };
    }

    await this.roomRepo.update({ id: rid } as any, upd as any);

    const updated = await this.roomRepo.findOne({
      where: { id: rid },
    });

    return {
      ok: true,
      room: {
        id: updated!.id,
        name: updated!.name,
        code: updated!.code,
        teacherId: updated!.teacherId,
        teacherNameSnapshot: updated!.teacherNameSnapshot,
        schoolYearId: updated!.schoolYearId,
        isActive: updated!.isActive,
        deactivatedAt: (updated as any)?.deactivatedAt ?? null,
        createdAt: (updated as any)?.createdAt ?? null,
      },
      teacher: teacherMeta || null,
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

    const studentsRaw = Array.isArray((overview as any)?.students)
      ? (overview as any).students
      : [];

    const scoresByStudent = new Map<string, number[]>();

    for (const e of corrected) {
      const sidStudent = String(e.studentId || '').trim();
      const score = this.toNumOrNull(e.score);

      if (!sidStudent || score === null) continue;

      if (!scoresByStudent.has(sidStudent)) {
        scoresByStudent.set(sidStudent, []);
      }

      scoresByStudent.get(sidStudent)!.push(score);
    }

    const students = studentsRaw.map((s: any) => {
      const sidStudent = String(s.id || '').trim();
      const scores = scoresByStudent.get(sidStudent) || [];

      const averageScore =
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null;

      return {
        ...s,
        averageScore,
      };
    });

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
        isActive: room.isActive,
        deactivatedAt: (room as any).deactivatedAt ?? null,
        createdAt: (room as any).createdAt ?? null,
      },
      overview: {
        ...(overview || {}),
        students,
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
```
