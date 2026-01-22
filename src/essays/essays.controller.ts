import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { EssaysService } from './essays.service';

@Controller('essays')
export class EssaysController {
  constructor(private readonly essaysService: EssaysService) {}

  // ✅ ENVIAR redação (bloqueia duplicado)
  @Post()
  create(@Body() body: any) {
    const taskId = (body.taskId || '').trim();
    const studentId = (body.studentId || '').trim();
    const content = body.content ?? '';

    if (!taskId || !studentId) {
      throw new BadRequestException('taskId e studentId são obrigatórios');
    }
    return this.essaysService.submit(taskId, studentId, content);
  }

  // ✅ SALVAR RASCUNHO (upsert)
  @Post('draft')
  saveDraft(@Body() body: any) {
    const taskId = (body.taskId || '').trim();
    const studentId = (body.studentId || '').trim();
    const content = body.content ?? '';

    if (!taskId || !studentId) {
      throw new BadRequestException('taskId e studentId são obrigatórios');
    }
    return this.essaysService.saveDraft(taskId, studentId, content);
  }

  // ✅ buscar redação/rascunho do aluno naquela tarefa
  @Get('by-task/:taskId/by-student')
  findByTaskAndStudent(
    @Param('taskId') taskId: string,
    @Query('studentId') studentId: string,
  ) {
    const t = (taskId || '').trim();
    const s = (studentId || '').trim();
    if (!t || !s) throw new BadRequestException('taskId e studentId são obrigatórios');

    return this.essaysService.findByTaskAndStudent(t, s);
  }

  @Post(':id/correct')
  correct(@Param('id') id: string, @Body() body: any) {
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

  // ✅ professor: lista redações com nome/email do aluno
  @Get('by-task/:taskId/with-student')
  findByTaskWithStudent(@Param('taskId') taskId: string) {
    return this.essaysService.findByTaskWithStudent(taskId);
  }

  @Get('by-task/:taskId')
  findByTask(@Param('taskId') taskId: string) {
    return this.essaysService.findByTask(taskId);
  }

  // ✅ desempenho (prof): por sala
  @Get('performance/by-room')
  performanceByRoom(@Query('roomId') roomId: string) {
    return this.essaysService.performanceByRoom(roomId);
  }

  // ✅ desempenho (aluno): por sala
  @Get('performance/by-room-for-student')
  performanceByRoomForStudent(
    @Query('roomId') roomId: string,
    @Query('studentId') studentId: string,
  ) {
    return this.essaysService.performanceByRoomForStudent(roomId, studentId);
  }

  // ✅ professor: uma redação com dados do aluno
  @Get(':id/with-student')
  findOneWithStudent(@Param('id') id: string) {
    return this.essaysService.findOneWithStudent(id);
  }

  // ✅ genérica por último
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.essaysService.findOne(id);
  }
}
