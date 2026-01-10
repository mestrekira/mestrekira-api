import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(
    @Body('roomId') roomId: string,
    @Body('title') title: string,
    @Body('guidelines') guidelines?: string,
  ) {
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
}
