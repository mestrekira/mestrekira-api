import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { SchoolDashboardService } from './school-dashboard.service';

@Controller('school-dashboard')
@UseGuards(AuthGuard('jwt'))
export class SchoolDashboardController {
  constructor(private readonly svc: SchoolDashboardService) {}

  private ensureSchool(req: Request) {
    const u: any = (req as any).user || {};
    const role = String(u.role || '').toLowerCase();
    const id = String(u.id || u.sub || '').trim();
    if (role !== 'school') throw new ForbiddenException('Apenas escola.');
    if (!id) throw new ForbiddenException('Token inválido.');
    return id;
  }

  @Get('rooms-summary')
  async roomsSummary(@Req() req: Request) {
    const schoolId = this.ensureSchool(req);
    return this.svc.roomsSummary(schoolId);
  }

  @Post('create-room')
  async createRoom(
    @Req() req: Request,
    @Body('roomName') roomName: string,
    @Body('teacherEmail') teacherEmail: string,
  ) {
    const schoolId = this.ensureSchool(req);

    const name = String(roomName || '').trim();
    const email = String(teacherEmail || '').trim().toLowerCase();

    if (!name || !email || !email.includes('@')) {
      throw new BadRequestException('roomName e teacherEmail são obrigatórios.');
    }

    return this.svc.createRoomForTeacherEmail(schoolId, name, email);
  }
}