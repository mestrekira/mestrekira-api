import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { EssaysService } from './essays.service';

@Controller('essays')
export class EssaysController {
  constructor(private readonly essaysService: EssaysService) {}

  @Post()
  create(@Body() body: any) {
    const { taskId, studentId, content } = body;
    return this.essaysService.create(taskId, studentId, content);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.essaysService.findOne(id);
  }

  @Get('by-task/:taskId')
  findByTask(@Param('taskId') taskId: string) {
    return this.essaysService.findByTask(taskId);
  }
}
