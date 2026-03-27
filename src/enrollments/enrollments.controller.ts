import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { EnrollmentsService } from './enrollments.service';
import { MustChangePasswordGuard } from '../auth/guards/must-change-password.guard';

@Controller('enrollments')
@UseGuards(AuthGuard('jwt'), MustChangePasswordGuard)
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  private ensureStudent(req: Request) {
    const role = String((req as any)?.user?.role || '').trim().toLowerCase();
    const id = String((req as any)?.user?.id || '').trim();

    if (role !== 'student') {
      throw new ForbiddenException('Apenas student pode acessar este recurso.');
    }

    if (!id) {
      throw new BadRequestException('Sessão inválida.');
    }

    return id;
  }

  /**
   * ✅ Entrar em sala por código (ALUNO)
   * - studentId vem do JWT
   * - compat: se vier studentId no body, valida se bate com o token
   */
  @Post('join')
  async join(
    @Req() req: Request,
    @Body() body: { code?: string; studentId?: string },
  ) {
    const tokenStudentId = this.ensureStudent(req);

    const code = String(body?.code || '').trim();
    const studentIdFromBody = String(body?.studentId || '').trim();

    if (!code) {
      throw new BadRequestException('code é obrigatório');
    }

    if (studentIdFromBody && studentIdFromBody !== tokenStudentId) {
      throw new ForbiddenException('studentId inválido para esta sessão.');
    }

    const enrollment = await this.enrollmentsService.joinByCode(
      code,
      tokenStudentId,
    );

    return { ok: true, roomId: enrollment.roomId };
  }

  /**
   * ✅ Listar salas do aluno logado
   * - compat: se vier query studentId, valida se bate com o token
   */
  @Get('by-student')
  async byStudent(
    @Req() req: Request,
    @Query('studentId') studentId?: string,
  ) {
    const tokenStudentId = this.ensureStudent(req);
    const studentIdFromQuery = String(studentId || '').trim();

    if (studentIdFromQuery && studentIdFromQuery !== tokenStudentId) {
      throw new ForbiddenException('studentId inválido para esta sessão.');
    }

    return this.enrollmentsService.findRoomsByStudent(tokenStudentId);
  }

  /**
   * ✅ Sair da sala (ALUNO)
   * - studentId vem do JWT
   * - compat: se vier studentId no body, valida se bate com o token
   */
  @Delete('leave')
  async leave(
    @Req() req: Request,
    @Body() body: { roomId?: string; studentId?: string },
  ) {
    const tokenStudentId = this.ensureStudent(req);

    const roomId = String(body?.roomId || '').trim();
    const studentIdFromBody = String(body?.studentId || '').trim();

    if (!roomId) {
      throw new BadRequestException('roomId é obrigatório');
    }

    if (studentIdFromBody && studentIdFromBody !== tokenStudentId) {
      throw new ForbiddenException('studentId inválido para esta sessão.');
    }

    return this.enrollmentsService.leaveRoom(roomId, tokenStudentId);
  }
}
