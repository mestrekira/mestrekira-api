import { Controller, Post, Body, Delete, Get, Query, BadRequestException } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('join')
  async join(@Body() body: { code: string; studentId: string }) {
    const code = (body.code || '').trim();
    const studentId = (body.studentId || '').trim();

    if (!code || !studentId) {
      throw new BadRequestException('code e studentId são obrigatórios');
    }

    const enrollment = await this.enrollmentsService.joinByCode(code, studentId);

    return { ok: true, roomId: enrollment.roomId };
  }

  // ✅ listar salas do aluno (usado no painel-aluno.js)
  @Get('by-student')
  async byStudent(@Query('studentId') studentId: string) {
    const id = (studentId || '').trim();
    if (!id) throw new BadRequestException('studentId é obrigatório');

    return this.enrollmentsService.findRoomsByStudent(id);
  }

  // ✅ sair da sala
  @Delete('leave')
  async leave(@Body() body: { roomId: string; studentId: string }) {
    const roomId = (body.roomId || '').trim();
    const studentId = (body.studentId || '').trim();

    if (!roomId || !studentId) {
      throw new BadRequestException('roomId e studentId são obrigatórios');
    }

    return this.enrollmentsService.leaveRoom(roomId, studentId);
  }
}
