import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { SchoolTeacherService } from './school-teacher.service';
import { MustChangePasswordGuard } from '../auth/guards/must-change-password.guard';

@Controller('school-teacher')
export class SchoolTeacherController {
  constructor(private readonly svc: SchoolTeacherService) {}

  private ensureSchool(req: Request) {
    const role = String((req as any)?.user?.role || '').toLowerCase();
    if (role !== 'school') throw new ForbiddenException('Apenas escola.');
    const id = String((req as any)?.user?.id || '').trim();
    if (!id) throw new BadRequestException('Sessão inválida.');
    return id;
  }

  /**
   * ✅ Escola cria convite (precisa estar logada)
   * POST /school-teacher/invite
   * body: { teacherEmail }
   */
  @Post('invite')
  @UseGuards(AuthGuard('jwt'), MustChangePasswordGuard)
  async invite(@Req() req: Request, @Body('teacherEmail') teacherEmail: string) {
    const schoolId = this.ensureSchool(req);
    return this.svc.createInvite(schoolId, teacherEmail);
  }

  /**
   * ✅ Professor aceita convite (endpoint público)
   * POST /school-teacher/accept
   * body: { code, teacherName }
   */
  @Post('accept')
  async accept(
    @Body('code') code: string,
    @Body('teacherName') teacherName: string,
  ) {
    return this.svc.acceptInvite(code, teacherName);
  }

  /**
   * ✅ Escola lista convites
   */
  @Get('invites')
  @UseGuards(AuthGuard('jwt'), MustChangePasswordGuard)
  async list(@Req() req: Request) {
    const schoolId = this.ensureSchool(req);
    return this.svc.listInvites(schoolId);
  }
}
