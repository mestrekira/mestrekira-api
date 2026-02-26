import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { SchoolsService } from './schools.service';
import { MustChangePasswordGuard } from '../auth/guards/must-change-password.guard';

@Controller('schools')
@UseGuards(AuthGuard('jwt'), MustChangePasswordGuard)
export class SchoolsController {
  constructor(private readonly svc: SchoolsService) {}

  private ensureSchool(req: Request) {
    const role = String((req as any)?.user?.role || '').toLowerCase();
    if (role !== 'school') throw new ForbiddenException('Apenas escola.');
    const id = String((req as any)?.user?.id || '').trim();
    if (!id) throw new BadRequestException('Sessão inválida.');
    return id;
  }

  /**
   * ✅ Escola cria sala para professor (1 por professor)
   * POST /schools/rooms
   * body: { roomName, teacherEmail }
   */
  @Post('rooms')
  async createRoom(
    @Req() req: Request,
    @Body('roomName') roomName: string,
    @Body('teacherEmail') teacherEmail: string,
  ) {
    const schoolId = this.ensureSchool(req);
    return this.svc.createRoomForTeacher(schoolId, roomName, teacherEmail);
  }

  /**
   * ✅ Lista salas da escola (com teacher)
   * GET /schools/rooms
   */
  @Get('rooms')
  async listRooms(@Req() req: Request) {
    const schoolId = this.ensureSchool(req);
    return this.svc.listRooms(schoolId);
  }

  /**
   * ✅ Média geral da sala
   * GET /schools/rooms/avg?roomId=...
   */
  @Get('rooms/avg')
  async avg(@Req() req: Request, @Query('roomId') roomId: string) {
    this.ensureSchool(req);
    const rid = String(roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId é obrigatório.');
    return this.svc.roomAverage(rid);
  }
}
