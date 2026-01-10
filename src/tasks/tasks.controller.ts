import { Controller, Get, Param, Post, Body, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // 🔹 Criar tarefa (professor)
  @Post()
  create(@Body() body: any) {
    const { roomId, title, guidelines } = body;
    return this.tasksService.create(roomId, title, guidelines);
  }

  // 🔹 Listar tarefas da sala (professor)
  @Get('by-room')
  findByRoom(@Query('roomId') roomId: string) {
    return this.tasksService.findByRoom(roomId);
  }

  // 🔹 ENDPOINT 2 — Listar tarefas para aluno
  @Get('by-room-for-student')
  findByRoomForStudent(
    @Query('roomId') roomId: string,
    @Query('studentId') studentId: string,
  ) {
    return this.tasksService.findByRoomForStudent(roomId, studentId);
  }

  // 🔹 Buscar tarefa específica
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasksService.findById(id);
  }
}
