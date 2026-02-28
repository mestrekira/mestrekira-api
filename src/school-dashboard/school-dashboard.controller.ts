import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { SchoolDashboardService } from './school-dashboard.service';
import { MustChangePasswordGuard } from '../auth/guards/must-change-password.guard';

@Controller('school-dashboard')
@UseGuards(AuthGuard('jwt'), MustChangePasswordGuard)
export class SchoolDashboardController {
  constructor(private readonly schoolDash: SchoolDashboardService) {}

  private ensureSchool(req: Request) {
    const role = String((req as any)?.user?.role || '').toLowerCase();
    if (role !== 'school') {
      throw new ForbiddenException('Apenas escolas podem acessar este recurso.');
    }
    const id = String((req as any)?.user?.id || (req as any)?.user?.sub || '').trim();
    if (!id) throw new ForbiddenException('Token inválido.');
    return id;
  }

  // ------------------------
  // Ano letivo
  // ------------------------
  @Post('years')
  createYear(@Req() req: Request, @Body('name') name: string) {
    const schoolId = this.ensureSchool(req);
    return this.schoolDash.createYear(schoolId, name);
  }

  @Get('years')
  listYears(@Req() req: Request) {
    const schoolId = this.ensureSchool(req);
    return this.schoolDash.listYears(schoolId);
  }

  @Patch('years/:id')
  renameYear(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('name') name: string,
    @Body('isActive') isActive?: boolean,
  ) {
    const schoolId = this.ensureSchool(req);
    return this.schoolDash.updateYear(schoolId, id, name, isActive);
  }

  @Delete('years/:id')
  deleteYear(@Req() req: Request, @Param('id') id: string) {
    const schoolId = this.ensureSchool(req);
    return this.schoolDash.deleteYear(schoolId, id);
  }

  // ------------------------
  // Salas (painel escolar)
  // ------------------------
  @Post('rooms')
  createRoom(
    @Req() req: Request,
    @Body() body: any,
  ) {
    const schoolId = this.ensureSchool(req);

    const name = String(body?.name || '').trim();
    const teacherEmail = String(body?.teacherEmail || '').trim().toLowerCase();
    const yearId = body?.yearId ? String(body.yearId).trim() : null;

    if (!name || !teacherEmail) {
      throw new BadRequestException('name e teacherEmail são obrigatórios.');
    }

    return this.schoolDash.createRoomForTeacherEmail(schoolId, name, teacherEmail, yearId);
  }

  @Get('rooms')
  listRooms(
    @Req() req: Request,
    @Query('yearId') yearId?: string,
  ) {
    const schoolId = this.ensureSchool(req);
    const y = yearId ? String(yearId).trim() : '';
    return this.schoolDash.listRooms(schoolId, y || null);
  }

  @Patch('rooms/:id')
  renameRoom(
    @Req() req: Request,
    @Param('id') roomId: string,
    @Body('name') name: string,
    @Body('teacherEmail') teacherEmail?: string,
    @Body('yearId') yearId?: string | null,
  ) {
    const schoolId = this.ensureSchool(req);

    const n = String(name || '').trim();
    const t = teacherEmail != null ? String(teacherEmail).trim().toLowerCase() : undefined;
    const y = yearId != null ? String(yearId).trim() : undefined;

    if (!n && t == null && y == null) {
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    }

    return this.schoolDash.updateRoom(schoolId, roomId, { name: n || undefined, teacherEmail: t, yearId: y });
  }

  @Delete('rooms/:id')
  deleteRoom(@Req() req: Request, @Param('id') roomId: string) {
    const schoolId = this.ensureSchool(req);
    return this.schoolDash.deleteRoom(schoolId, roomId);
  }

 
  @Get('rooms/:id/overview')
  overview(@Req() req: Request, @Param('id') roomId: string) {
    const schoolId = this.ensureSchool(req);
    return this.schoolDash.roomOverview(schoolId, roomId);
  }
}
