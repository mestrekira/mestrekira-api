import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { TasksService } from './tasks.service';
import { MustChangePasswordGuard } from '../auth/guards/must-change-password.guard';

@Controller('tasks')
@UseGuards(AuthGuard('jwt'), MustChangePasswordGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  private ensureProfessor(req: Request) {
    const role = String((req as any)?.user?.role || '').toLowerCase();
    if (role !== 'professor') {
      throw new ForbiddenException('Apenas professores podem acessar este recurso.');
    }
    const id = String((req as any)?.user?.id || '').trim();
    if (!id) throw new BadRequestException('Sessão inválida.');
    return id;
  }

  /**
   * ✅ Criar tarefa (professor)
   * Mantém payload atual: { roomId, title, guidelines }
   */
  @Post()
  create(@Req() req: Request, @Body() body: any) {
    this.ensureProfessor(req);

    const roomId = String(body?.roomId || '').trim();
    const title = String(body?.title || '').trim();
    const guidelines = body?.guidelines ?? '';

    if (!roomId || !title) {
      throw new BadRequestException('roomId e title são obrigatórios.');
    }

    return this.tasksService.create(roomId, title, guidelines);
  }

  /**
   * ✅ Listar tarefas por sala (professor)
   */
  @Get('by-room')
  findByRoom(@Req() req: Request, @Query('roomId') roomId: string) {
    this.ensureProfessor(req);

    const r = String(roomId || '').trim();
    if (!r) throw new BadRequestException('roomId é obrigatório.');

    return this.tasksService.findByRoom(r);
  }

  /**
   * ✅ Buscar tarefa por id (professor)
   */
  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    this.ensureProfessor(req);

    const tid = String(id || '').trim();
    if (!tid) throw new BadRequestException('id é obrigatório.');

    return this.tasksService.findById(tid);
  }

  /**
   * ✅ Excluir tarefa (professor)
   */
  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    this.ensureProfessor(req);

    const tid = String(id || '').trim();
    if (!tid) throw new BadRequestException('id é obrigatório.');

    return this.tasksService.remove(tid);
  }
}
