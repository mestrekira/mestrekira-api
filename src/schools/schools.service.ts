import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { UserEntity } from '../users/user.entity';
import { RoomEntity } from '../rooms/room.entity';

@Injectable()
export class SchoolsService {
  private readonly LIMIT_MAX_ROOMS_PER_SCHOOL = 10;

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,
  ) {}

  private norm(s: any) {
    return String(s || '').trim();
  }

  private emailNorm(s: any) {
    return String(s || '').trim().toLowerCase();
  }

  private async generateUniqueRoomCode(maxAttempts = 12) {
    for (let i = 0; i < maxAttempts; i++) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const exists = await this.roomRepo.findOne({ where: { code } });
      if (!exists) return code;
    }
    throw new BadRequestException(
      'Não foi possível gerar um código único para a sala.',
    );
  }

  async createRoomAsSchool(
    schoolId: string,
    body: { roomName: string; teacherName: string; teacherEmail: string },
  ) {
    const sid = this.norm(schoolId);
    const roomName = this.norm(body?.roomName);
    const teacherName = this.norm(body?.teacherName);
    const teacherEmail = this.emailNorm(body?.teacherEmail);

    if (!roomName || !teacherName || !teacherEmail) {
      throw new BadRequestException(
        'Informe roomName, teacherName e teacherEmail.',
      );
    }
    if (!teacherEmail.includes('@')) {
      throw new BadRequestException('teacherEmail inválido.');
    }

    const school = await this.userRepo.findOne({ where: { id: sid } });
    if (!school) throw new NotFoundException('Escola não encontrada.');
    if (String(school.role || '').toLowerCase() !== 'school') {
      throw new BadRequestException('Acesso inválido (não é escola).');
    }

    // limite 10 salas por escola
    const currentRooms = await this.roomRepo.count({
      where: { ownerType: 'SCHOOL', schoolId: sid } as any,
    });

    if (currentRooms >= this.LIMIT_MAX_ROOMS_PER_SCHOOL) {
      throw new BadRequestException(
        `Limite atingido: no máximo ${this.LIMIT_MAX_ROOMS_PER_SCHOOL} salas por escola.`,
      );
    }

    // professor já existe?
    const existing = await this.userRepo.findOne({
      where: { email: teacherEmail },
    });

    if (existing) {
      const role = String(existing.role || '').toLowerCase();
      const pType = String((existing as any).professorType || '').toUpperCase();

      // bloquear se for professor individual
      if (role === 'professor' && (pType === '' || pType === 'INDIVIDUAL')) {
        throw new BadRequestException(
          'Já existe um professor individual com este e-mail. Não é possível cadastrar pela escola.',
        );
      }

      // se for professor SCHOOL, precisa ser da mesma escola
      if (role === 'professor' && pType === 'SCHOOL') {
        const linkedSchoolId = (existing as any).schoolId;
        if (linkedSchoolId && String(linkedSchoolId) !== sid) {
          throw new BadRequestException(
            'Este professor já está vinculado a outra escola.',
          );
        }
      }

      // se for aluno/escola com esse email, bloquear
      if (role !== 'professor') {
        throw new BadRequestException(
          'Este e-mail já está em uso por outro tipo de conta.',
        );
      }
    }

    let teacher: UserEntity;

    if (existing) {
      teacher = existing;
    } else {
      // senha temporária
      const tempPassword = Math.random().toString(36).slice(2) + 'A1!';
      const hash = await bcrypt.hash(tempPassword, 10);

      const created = this.userRepo.create({
        name: teacherName,
        email: teacherEmail,
        password: hash,
        role: 'professor',

        professorType: 'SCHOOL',
        schoolId: sid,
        mustChangePassword: true,
        trialMode: false,
        isActive: true,

        // decisão prática: professor gerenciado já nasce verificado
        emailVerified: true,
        emailVerifiedAt: new Date(),
      } as any);

      teacher = (await this.userRepo.save(created)) as UserEntity;
    }

    // regra: 1 sala por professor por escola
    const already = await this.roomRepo.findOne({
      where: {
        ownerType: 'SCHOOL',
        schoolId: sid,
        teacherId: teacher.id,
      } as any,
    });

    if (already) {
      throw new BadRequestException(
        'Esta escola já possui uma sala cadastrada para este professor.',
      );
    }

    const code = await this.generateUniqueRoomCode();

    const roomCreated = this.roomRepo.create({
      name: roomName,
      professorId: teacher.id, // compat com seu sistema atual

      code,

      ownerType: 'SCHOOL',
      schoolId: sid,
      teacherId: teacher.id,
      teacherNameSnapshot: teacherName,
    } as any);

    const saved = (await this.roomRepo.save(roomCreated)) as RoomEntity;

    return {
      ok: true,
      room: {
        id: saved.id,
        name: saved.name,
        code: saved.code,
        ownerType: (saved as any).ownerType,
        schoolId: (saved as any).schoolId,
        teacherId: (saved as any).teacherId,
        teacherName: (saved as any).teacherNameSnapshot,
        professorId: saved.professorId,
      },
      teacher: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        professorType: (teacher as any).professorType ?? null,
        mustChangePassword: !!(teacher as any).mustChangePassword,
      },
    };
  }

  async listRoomsBySchool(schoolId: string) {
    const sid = this.norm(schoolId);

    const rooms = await this.roomRepo.find({
      where: { ownerType: 'SCHOOL', schoolId: sid } as any,
      order: { name: 'ASC' } as any,
    });

    return rooms.map((r: any) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      teacherId: r.teacherId ?? null,
      teacherName: r.teacherNameSnapshot ?? null,
      professorId: r.professorId,
    }));
  }
}
