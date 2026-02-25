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
import { TasksService } from '../tasks/tasks.service';
import { RoomsService } from '../rooms/rooms.service';
import { MustChangePasswordGuard } from '../auth/guards/must-change-password.guard';

@Controller('essays')
@UseGuards(AuthGuard('jwt'), MustChangePasswordGuard)
export class EssaysController {
  constructor(
    private readonly essaysService: EssaysService,
    private readonly tasksService: TasksService,
    private readonly roomsService: RoomsService,
  ) {}

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

  /**
   * ✅ Ownership: garante que a ROOM pertence ao professor logado
   */
  private async ensureProfessorOwnsRoom(req: Request, roomId: string) {
    const professorId = this.ensureProfessor(req);

    const rid = String(roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId inválido.');

    const room = await this.roomsService.findById(rid);
    if (!room) throw new NotFoundException('Sala não encontrada.');

    if (String((room as any).professorId || '').trim() !== professorId) {
      throw new ForbiddenException('Você não tem acesso a esta sala.');
    }

    return { professorId, room };
  }

  /**
   * ✅ Ownership: garante que a TASK pertence a uma sala do professor
   */
  private async ensureProfessorOwnsTask(req: Request, taskId: string) {
    this.ensureProfessor(req);

    const tid = String(taskId || '').trim();
    if (!tid) throw new BadRequestException('taskId inválido.');

    const task = await this.tasksService.findById(tid);
    if (!task) throw new NotFoundException('Tarefa não encontrada.');

    const roomId = String((task as any).roomId || '').trim();
    if (!roomId) throw new BadRequestException('Tarefa inválida (roomId ausente).');

    await this.ensureProfessorOwnsRoom(req, roomId);
    return task;
  }

  /**
   * ✅ Ownership: garante que a ESSAY pertence ao professor (via task->room)
   */
  private async ensureProfessorOwnsEssay(req: Request, essayId: string) {
    this.ensureProfessor(req);

    const eid = String(essayId || '').trim();
    if (!eid) throw new BadRequestException('id inválido.');

    const essay = await this.essaysService.findOne(eid);
    if (!essay) throw new NotFoundException('Redação não encontrada.');

    const taskId = String((essay as any).taskId || '').trim();
    if (!taskId) throw new BadRequestException('Redação inválida (taskId ausente).');

    await this.ensureProfessorOwnsTask(req, taskId);
    return essay;
  }

  // ✅ ping
  @Get('ping')
  ping() {
    return { ok: true, where: 'essays' };
  }

  /**
   * ✅ ENVIAR redação (ALUNO)
   * - studentId vem do JWT
   * - compat: se vier studentId no body, valida que é igual ao token
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
   * - compat: se vier query studentId, valida
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
   * ✅ Corrigir redação (PROFESSOR + ownership)
   */
  @Post(':id/correct')
  async correct(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const essayId = String(id || '').trim();
    if (!essayId) throw new BadRequestException('id é obrigatório.');

    // ✅ garante que a redação é de uma sala do professor
    await this.ensureProfessorOwnsEssay(req, essayId);

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
   * ✅ Listar redações por tarefa com dados do aluno (PROFESSOR + ownership)
   */
  @Get('by-task/:taskId/with-student')
  async findByTaskWithStudent(@Req() req: Request, @Param('taskId') taskId: string) {
    const t = String(taskId || '').trim();
    if (!t) throw new BadRequestException('taskId é obrigatório.');

    await this.ensureProfessorOwnsTask(req, t);

    return this.essaysService.findByTaskWithStudent(t);
  }

  /**
   * ✅ Listar redações por tarefa (PROFESSOR + ownership)
   */
  @Get('by-task/:taskId')
  async findByTask(@Req() req: Request, @Param('taskId') taskId: string) {
    const t = String(taskId || '').trim();
    if (!t) throw new BadRequestException('taskId é obrigatório.');

    await this.ensureProfessorOwnsTask(req, t);

    return this.essaysService.findByTask(t);
  }

  /**
   * ✅ Performance por sala (PROFESSOR + ownership)
   */
  @Get('performance/by-room')
  async performanceByRoom(@Req() req: Request, @Query('roomId') roomId: string) {
    const r = String(roomId || '').trim();
    if (!r) throw new BadRequestException('roomId é obrigatório.');

    await this.ensureProfessorOwnsRoom(req, r);

    return this.essaysService.performanceByRoom(r);
  }

  /**
   * ✅ Performance por sala para aluno (ALUNO)
   * - studentId vem do JWT
   * - compat: se vier query studentId, valida
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
   * ✅ Buscar redação com aluno (PROFESSOR + ownership)
   */
  @Get(':id/with-student')
  async findOneWithStudent(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.ensureProfessorOwnsEssay(req, id);
    return this.essaysService.findOneWithStudent(id);
  }

  /**
   * ✅ Buscar redação por id (PROFESSOR + ownership)
   */
  @Get(':id')
  async findOne(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.ensureProfessorOwnsEssay(req, id);
    return this.essaysService.findOne(id);
  }
}
