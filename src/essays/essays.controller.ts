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

  
@Post(':id/correct')
correct(
  @Param('id') id: string,
  @Body() body: any,
) {
  const { feedback, c1, c2, c3, c4, c5 } = body;
  return this.essaysService.correctEnem(
    id,
    feedback,
    Number(c1),
    Number(c2),
    Number(c3),
    Number(c4),
    Number(c5),
  );
}
  // ✅ genérica por último
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.essaysService.findOne(id);
  }
}

