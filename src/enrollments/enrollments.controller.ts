import { Controller, Post, Body, Delete, Get, Query } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('join')
  async join(@Body() body: { code: string; studentId: string }) {
    const enrollment = await this.enrollmentsService.joinByCode(
      body.code,
      body.studentId,
    );

    return { ok: true, roomId: enrollment.roomId };
  }

  // ✅ listar salas do aluno (você já usa no painel-aluno.js)
  @Get('by-student')
  async byStudent(@Query('studentId') studentId: string) {
    return this.enrollmentsService.findRoomsByStudent(studentId);
  }

  // ✅ sair da sala
  @Delete('leave')
  async leave(@Body() body: { roomId: string; studentId: string }) {
    return this.enrollmentsService.leaveRoom(body.roomId, body.studentId);
  }
}
