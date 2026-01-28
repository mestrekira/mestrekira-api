import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { EssaysService } from './essays.service';
import { ParseUUIDPipe } from '@nestjs/common';
@Controller('essays')
export class EssaysController {
  constructor(private readonly essaysService: EssaysService) {}

  // ✅ ping primeiro (evita conflito com /:id em alguns setups)
  @Get('ping')
  ping() {
    return { ok: true, where: 'essays' };
  }

  // ✅ ENVIAR redação (bloqueia duplicado no service)
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
  async findByTaskAndStudent(
    @Param('taskId') taskId: string,
    @Query('studentId') studentId: string,
  ) {
    const t = (taskId || '').trim();
    const s = (studentId || '').trim();
    if (!t || !s) throw new BadRequestException('taskId e studentId são obrigatórios');

    const essay = await this.essaysService.findByTaskAndStudent(t, s);
    if (!essay) throw new NotFoundException('Redação não encontrada');
    return essay;
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

  @Get('by-task/:taskId/with-student')
  findByTaskWithStudent(@Param('taskId') taskId: string) {
    return this.essaysService.findByTaskWithStudent(taskId);
  }

  @Get('by-task/:taskId')
  findByTask(@Param('taskId') taskId: string) {
    return this.essaysService.findByTask(taskId);
  }

  @Get('performance/by-room')
  performanceByRoom(@Query('roomId') roomId: string) {
    return this.essaysService.performanceByRoom(roomId);
  }

  @Get('performance/by-room-for-student')
  performanceByRoomForStudent(
    @Query('roomId') roomId: string,
    @Query('studentId') studentId: string,
  ) {
    return this.essaysService.performanceByRoomForStudent(roomId, studentId);
  }

  @Get(':id/with-student')
findOneWithStudent(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
  return this.essaysService.findOneWithStudent(id);
}


  @Get(':id')
findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
  return this.essaysService.findOne(id);
}
}

