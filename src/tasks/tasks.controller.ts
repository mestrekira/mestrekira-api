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
  NotFoundException,
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

  private norm(v: any) {
    const s = String(v ?? '').trim();
    return s && s !== 'undefined' && s !== 'null' ? s : '';
  }

  private normRole(v: any) {
    const r = String(v || '').trim().toLowerCase();
    if (r === 'aluno') return 'student';
    if (r === 'teacher') return 'professor';
    if (r === 'escola') return 'school';
    return r;
  }

  private getTokenUser(req: Request) {
    const user: any = (req as any)?.user || {};
    return {
      id: this.norm(user.id || user.sub || user.userId),
      role: this.normRole(user.role),
    };
  }

  private ensureProfessor(req: Request) {
    const { id, role } = this.getTokenUser(req);

    if (role !== 'professor') {
      throw new ForbiddenException('Apenas professores podem acessar este recurso.');
    }

    if (!id) {
      throw new BadRequestException('Sessão inválida.');
    }

    return id;
  }

  private ensureStudent(req: Request) {
    const { id, role } = this.getTokenUser(req);

    if (role !== 'student') {
      throw new ForbiddenException('Apenas alunos podem acessar este recurso.');
    }

    if (!id) {
      throw new BadRequestException('Sessão inválida.');
    }

    return id;
  }

  /**
   * ✅ Garante que a sala existe e pertence ao professor
   */
  private async ensureProfessorOwnsRoom(req: Request, roomId: string) {
    const professorId = this.ensureProfessor(req);

    const rid = this.norm(roomId);
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    const room = await this.roomsService.findById(rid);
    if (!room) throw new NotFoundException('Sala não encontrada.');

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

    const tid = this.norm(taskId);
    if (!tid) throw new BadRequestException('id é obrigatório.');

    const task = await this.tasksService.findById(tid);
    if (!task) throw new NotFoundException('Tarefa não encontrada.');

    const roomId = String((task as any).roomId || '').trim();
    if (!roomId) {
      throw new BadRequestException('Tarefa inválida (roomId ausente).');
    }

    await this.ensureProfessorOwnsRoom(req, roomId);
    return task;
  }

  /**
   * ✅ Criar tarefa (professor)
   * payload: { roomId, title, guidelines }
   */
  @Post()
  async create(@Req() req: Request, @Body() body: any) {
    const roomId = this.norm(body?.roomId);
    const title = this.norm(body?.title);
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
    const rid = this.norm(roomId);
    if (!rid) throw new BadRequestException('roomId é obrigatório.');

    await this.ensureProfessorOwnsRoom(req, rid);

    return this.tasksService.findByRoom(rid);
  }

  /**
   * ✅ Listar tarefas por sala para aluno matriculado
   * IMPORTANTE: precisa vir antes de @Get(':id')
   */
  @Get('by-room-student')
  async byRoomStudent(@Req() req: Request, @Query('roomId') roomId: string) {
    const studentId = this.ensureStudent(req);
    const rid = this.norm(roomId);

    if (!rid) {
      throw new BadRequestException('roomId é obrigatório.');
    }

    return this.tasksService.findByRoomForStudent(rid, studentId);
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

    const tid = this.norm(id);
    return this.tasksService.remove(tid);
  }
}
