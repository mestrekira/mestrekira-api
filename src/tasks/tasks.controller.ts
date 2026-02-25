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
import { RoomsService } from '../rooms/rooms.service';
import { MustChangePasswordGuard } from '../auth/guards/must-change-password.guard';

@Controller('tasks')
@UseGuards(AuthGuard('jwt'), MustChangePasswordGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly roomsService: RoomsService,
  ) {}

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
   * ✅ Garante que a sala existe e pertence ao professor
   */
  private async ensureProfessorOwnsRoom(req: Request, roomId: string) {
    const professorId = this.ensureProfessor(req);

    const rid = String(roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomsService.findById(rid);
    if (!room) throw new BadRequestException('Sala não encontrada.');

    if (String((room as any).professorId || '').trim() !== professorId) {
      throw new ForbiddenException('Você não tem acesso a esta sala.');
    }

    return { professorId, room };
  }

  /**
   * ✅ Garante que a tarefa existe e pertence a uma sala do professor
   */
  private async ensureProfessorOwnsTask(req: Request, taskId: string) {
    this.ensureProfessor(req);

    const tid = String(taskId || '').trim();
    if (!tid) throw new BadRequestException('id é obrigatório.');

    const task = await this.tasksService.findById(tid);
    if (!task) throw new BadRequestException('Tarefa não encontrada.');

    const roomId = String((task as any).roomId || '').trim();
    if (!roomId) throw new BadRequestException('Tarefa inválida (roomId ausente).');

    await this.ensureProfessorOwnsRoom(req, roomId);
    return task;
  }

  /**
   * ✅ Criar tarefa (professor)
   * payload: { roomId, title, guidelines }
   */
  @Post()
  async create(@Req() req: Request, @Body() body: any) {
    const roomId = String(body?.roomId || '').trim();
    const title = String(body?.title || '').trim();
    const guidelines = body?.guidelines ?? '';

    if (!roomId || !title) {
      throw new BadRequestException('roomId e title são obrigatórios.');
    }

    await this.ensureProfessorOwnsRoom(req, roomId);

    return this.tasksService.create(roomId, title, guidelines);
  }

  /**
   * ✅ Listar tarefas por sala (professor + ownership)
   */
  @Get('by-room')
  async findByRoom(@Req() req: Request, @Query('roomId') roomId: string) {
    const rid = String(roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    await this.ensureProfessorOwnsRoom(req, rid);

    return this.tasksService.findByRoom(rid);
  }

  /**
   * ✅ Buscar tarefa por id (professor + ownership via task->room)
   */
  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    return this.ensureProfessorOwnsTask(req, id);
  }

  /**
   * ✅ Excluir tarefa (professor + ownership via task->room)
   */
  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.ensureProfessorOwnsTask(req, id);
    return this.tasksService.remove(String(id || '').trim());
  }
}
