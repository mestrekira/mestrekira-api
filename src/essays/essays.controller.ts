import { Controller, Post, Get, Body, Param, Patch, Query } from '@nestjs/common';
import { EssaysService } from './essays.service';

@Controller('essays')
export class EssaysController {
  constructor(private readonly essaysService: EssaysService) {}

  // 🔹 ENVIO DA REDAÇÃO
  @Post()
  create(
    @Body('taskId') taskId: string,
    @Body('studentId') studentId: string,
    @Body('content') content: string,
  ) {
    return this.essaysService.create(taskId, studentId, content);
  }

  // 🔹 LISTAR POR TAREFA (PROFESSOR)
  @Get('by-task')
  findByTask(@Query('taskId') taskId: string) {
    return this.essaysService.findByTask(taskId);
  }

  // 🔹 BUSCAR REDAÇÃO
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.essaysService.findById(id);
  }

  // 🔹 CORREÇÃO
  @Patch(':id')
  correct(
    @Param('id') id: string,
    @Body('feedback') feedback: string,
    @Body('score') score: number,
  ) {
    return this.essaysService.correct(id, feedback, score);
  }
}
