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

  // ✅ rota usada pelo professor (lista redações + nome/email do aluno)
  @Get('by-task/:taskId/with-student')
  findByTaskWithStudent(@Param('taskId') taskId: string) {
    return this.essaysService.findByTaskWithStudent(taskId);
  }

  // (opcional) rota simples
  @Get('by-task/:taskId')
  findByTask(@Param('taskId') taskId: string) {
    return this.essaysService.findByTask(taskId);
  }

  // ✅ salvar correção (professor)
  @Post(':id/correct')
  correct(@Param('id') id: string, @Body() body: any) {
    const { feedback, score } = body;
    return this.essaysService.correct(id, feedback, score);
  }

  // ✅ genérica por último
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.essaysService.findOne(id);
  }
}
