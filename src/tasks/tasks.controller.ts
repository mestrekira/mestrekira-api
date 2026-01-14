import { Controller, Get, Param, Post, Body, Query, Delete } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@Body() body: any) {
    const { roomId, title, guidelines } = body;
    return this.tasksService.create(roomId, title, guidelines);
  }

  @Get('by-room')
  findByRoom(@Query('roomId') roomId: string) {
    return this.tasksService.findByRoom(roomId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasksService.findById(id);
  }

  // ✅ NOVO: excluir tarefa
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }
}
