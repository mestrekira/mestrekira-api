import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TaskEntity } from './task.entity';
import { EnrollmentEntity } from '../enrollments/enrollment.entity';
import { EssayEntity } from '../essays/essay.entity';
import { RoomEntity } from '../rooms/room.entity';
import { SchoolYearEntity } from '../school-dashboard/school-year.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,

    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentRepo: Repository<EnrollmentEntity>,

    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,

    @InjectRepository(SchoolYearEntity)
    private readonly schoolYearRepo: Repository<SchoolYearEntity>,
  ) {}

  private assertRoomExists(room: RoomEntity | null) {
    if (!room) {
      throw new NotFoundException('Sala não encontrada.');
    }
  }

  private async assertRoomAvailable(room: RoomEntity | null) {
    if (!room) {
      throw new NotFoundException('Sala não encontrada.');
    }

    if (room.isActive === false) {
      throw new ForbiddenException(
        'Esta sala está desativada e não permite esta operação.',
      );
    }

    const isSchoolRoom =
      String(room.ownerType || '').trim().toUpperCase() === 'SCHOOL';

    const schoolYearId = String(room.schoolYearId || '').trim();

    if (!isSchoolRoom || !schoolYearId) {
      return;
    }

    const year = await this.schoolYearRepo.findOne({
      where: { id: schoolYearId },
    });

    if (!year) {
      throw new ForbiddenException(
        'O ano letivo vinculado a esta sala não foi encontrado.',
      );
    }

    if (year.isActive === false) {
      throw new ForbiddenException(
        'O ano letivo desta sala está desativado e não permite esta operação.',
      );
    }
  }

  async create(roomId: string, title: string, guidelines?: string) {
    const r = String(roomId || '').trim();
    const t = String(title || '').trim();

    if (!r || !t) {
      throw new BadRequestException('roomId e title são obrigatórios.');
    }

    const room = await this.roomRepo.findOne({ where: { id: r } });
    await this.assertRoomAvailable(room);

    const task = this.taskRepo.create({
      roomId: r,
      title: t,
      guidelines: guidelines ?? '',
    });

    return this.taskRepo.save(task);
  }

  async findByRoom(roomId: string) {
    const r = String(roomId || '').trim();
    if (!r) {
      throw new BadRequestException('roomId é obrigatório.');
    }

    const room = await this.roomRepo.findOne({ where: { id: r } });
    this.assertRoomExists(room);

    return this.taskRepo.find({
      where: { roomId: r },
      order: { createdAt: 'DESC' as any },
    });
  }

  async findById(id: string) {
    const tid = String(id || '').trim();
    if (!tid) {
      throw new BadRequestException('id é obrigatório.');
    }

    return this.taskRepo.findOne({ where: { id: tid } });
  }

  async findByRoomForStudent(roomId: string, studentId: string) {
    const rid = String(roomId || '').trim();
    const sid = String(studentId || '').trim();

    if (!rid || !sid) {
      throw new BadRequestException('roomId e studentId são obrigatórios.');
    }

    const room = await this.roomRepo.findOne({ where: { id: rid } });
    await this.assertRoomAvailable(room);

    const enrollment = await this.enrollmentRepo.findOne({
      where: { roomId: rid, studentId: sid },
    });

    if (!enrollment) {
      throw new ForbiddenException('Você não participa desta sala.');
    }

    return this.taskRepo.find({
      where: { roomId: rid },
      order: { createdAt: 'DESC' as any },
    });
  }

  async remove(id: string) {
    const tid = String(id || '').trim();
    if (!tid) {
      throw new BadRequestException('id é obrigatório.');
    }

    const task = await this.taskRepo.findOne({ where: { id: tid } });
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    const room = await this.roomRepo.findOne({ where: { id: task.roomId } });
    await this.assertRoomAvailable(room);

    await this.essayRepo.delete({ taskId: tid });
    await this.taskRepo.delete(tid);

    return { ok: true };
  }

  async byRoom(roomId: string) {
    const r = String(roomId || '').trim();
    if (!r) return [];

    const room = await this.roomRepo.findOne({ where: { id: r } });
    this.assertRoomExists(room);

    return this.taskRepo.find({
      where: { roomId: r },
      order: { createdAt: 'DESC' as any },
    });
  }
}
