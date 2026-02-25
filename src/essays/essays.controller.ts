import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { EssaysService } from './essays.service';
import { MustChangePasswordGuard } from '../auth/guards/must-change-password.guard';

@Controller('essays')
@UseGuards(AuthGuard('jwt'), MustChangePasswordGuard)
export class EssaysController {
  constructor(private readonly essaysService: EssaysService) {}

  private ensureRole(req: Request, expected: 'student' | 'professor') {
    const role = String((req as any)?.user?.role || '').toLowerCase();
    if (role !== expected) {
      throw new ForbiddenException(`Apenas ${expected} pode acessar este recurso.`);
    }
    const id = String((req as any)?.user?.id || '').trim();
    if (!id) throw new BadRequestException('Sessão inválida.');
    return id;
  }

  private ensureStudent(req: Request) {
    return this.ensureRole(req, 'student');
  }

  private ensureProfessor(req: Request) {
    return this.ensureRole(req, 'professor');
  }

  // ✅ ping
  @Get('ping')
  ping() {
    return { ok: true, where: 'essays' };
  }

  /**
   * ✅ ENVIAR redação (ALUNO)
   * - Agora o studentId vem do JWT
   * - Mantém compatibilidade: se vier studentId no body, valida que é o mesmo do token
   */
  @Post()
  create(@Req() req: Request, @Body() body: any) {
    const tokenStudentId = this.ensureStudent(req);

    const taskId = String(body?.taskId || '').trim();
    const studentIdFromBody = String(body?.studentId || '').trim(); // compat
    const content = body?.content ?? '';

    if (!taskId) throw new BadRequestException('taskId é obrigatório.');

    if (studentIdFromBody && studentIdFromBody !== tokenStudentId) {
      throw new ForbiddenException('studentId inválido para esta sessão.');
    }

    return this.essaysService.submit(taskId, tokenStudentId, content);
  }

  /**
   * ✅ SALVAR RASCUNHO (ALUNO)
   * Mesma regra de segurança do create()
   */
  @Post('draft')
  saveDraft(@Req() req: Request, @Body() body: any) {
    const tokenStudentId = this.ensureStudent(req);

    const taskId = String(body?.taskId || '').trim();
    const studentIdFromBody = String(body?.studentId || '').trim(); // compat
    const content = body?.content ?? '';

    if (!taskId) throw new BadRequestException('taskId é obrigatório.');

    if (studentIdFromBody && studentIdFromBody !== tokenStudentId) {
      throw new ForbiddenException('studentId inválido para esta sessão.');
    }

    return this.essaysService.saveDraft(taskId, tokenStudentId, content);
  }

  /**
   * ✅ buscar redação/rascunho do aluno naquela tarefa (ALUNO)
   * - studentId vem do JWT
   * - se vier query studentId, valida compatibilidade
   */
  @Get('by-task/:taskId/by-student')
  async findByTaskAndStudent(
    @Req() req: Request,
    @Param('taskId') taskId: string,
    @Query('studentId') studentId: string, // compat
  ) {
    const tokenStudentId = this.ensureStudent(req);

    const t = String(taskId || '').trim();
    const s = String(studentId || '').trim();

    if (!t) throw new BadRequestException('taskId é obrigatório.');

    if (s && s !== tokenStudentId) {
      throw new ForbiddenException('studentId inválido para esta sessão.');
    }

    const essay = await this.essaysService.findByTaskAndStudent(t, tokenStudentId);
    if (!essay) throw new NotFoundException('Redação não encontrada');
    return essay;
  }

  /**
   * ✅ Corrigir redação (PROFESSOR)
   */
  @Post(':id/correct')
  correct(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    this.ensureProfessor(req);

    const essayId = String(id || '').trim();
    if (!essayId) throw new BadRequestException('id é obrigatório.');

    const { feedback, c1, c2, c3, c4, c5 } = body || {};

    return this.essaysService.correctEnem(
      essayId,
      feedback,
      Number(c1),
      Number(c2),
      Number(c3),
      Number(c4),
      Number(c5),
    );
  }

  /**
   * ✅ Listar redações por tarefa com dados do aluno (PROFESSOR)
   */
  @Get('by-task/:taskId/with-student')
  findByTaskWithStudent(@Req() req: Request, @Param('taskId') taskId: string) {
    this.ensureProfessor(req);

    const t = String(taskId || '').trim();
    if (!t) throw new BadRequestException('taskId é obrigatório.');

    return this.essaysService.findByTaskWithStudent(t);
  }

  /**
   * ✅ Listar redações por tarefa (PROFESSOR)
   */
  @Get('by-task/:taskId')
  findByTask(@Req() req: Request, @Param('taskId') taskId: string) {
    this.ensureProfessor(req);

    const t = String(taskId || '').trim();
    if (!t) throw new BadRequestException('taskId é obrigatório.');

    return this.essaysService.findByTask(t);
  }

  /**
   * ✅ Performance por sala (PROFESSOR)
   */
  @Get('performance/by-room')
  performanceByRoom(@Req() req: Request, @Query('roomId') roomId: string) {
    this.ensureProfessor(req);

    const r = String(roomId || '').trim();
    if (!r) throw new BadRequestException('roomId é obrigatório.');

    return this.essaysService.performanceByRoom(r);
  }

  /**
   * ✅ Performance por sala para aluno (ALUNO)
   * - studentId vem do JWT
   * - se vier query studentId, valida compatibilidade
   */
  @Get('performance/by-room-for-student')
  performanceByRoomForStudent(
    @Req() req: Request,
    @Query('roomId') roomId: string,
    @Query('studentId') studentId: string, // compat
  ) {
    const tokenStudentId = this.ensureStudent(req);

    const r = String(roomId || '').trim();
    const s = String(studentId || '').trim();

    if (!r) throw new BadRequestException('roomId é obrigatório.');

    if (s && s !== tokenStudentId) {
      throw new ForbiddenException('studentId inválido para esta sessão.');
    }

    return this.essaysService.performanceByRoomForStudent(r, tokenStudentId);
  }

  /**
   * ✅ Buscar redação com aluno (PROFESSOR)
   */
  @Get(':id/with-student')
  findOneWithStudent(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    this.ensureProfessor(req);
    return this.essaysService.findOneWithStudent(id);
  }

  /**
   * ✅ Buscar redação por id:
   * - Professor pode ver qualquer redação (do escopo dele via service, se você filtrar)
   * - Aluno pode ver a sua (se quiser, você pode mover para rota específica)
   *
   * Por segurança mínima agora: deixo PROFESSOR apenas.
   * Se você precisa que o aluno abra /essays/:id, me diga e eu libero com checagem no service.
   */
  @Get(':id')
  findOne(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    this.ensureProfessor(req);
    return this.essaysService.findOne(id);
  }
}
