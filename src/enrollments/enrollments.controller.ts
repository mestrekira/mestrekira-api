import { Controller, Post, Body, Delete } from '@nestjs/common';
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

    return { roomId: enrollment.roomId };
  }

  // 🔹 NOVO ENDPOINT
  @Get('by-student')
  findByStudent(@Query('studentId') studentId: string) {
    return this.enrollmentsService.findRoomsByStudent(studentId);
  }

  // ✅ NOVO: aluno sair da sala
  @Delete('leave')
  async leave(@Body() body: { roomId: string; studentId: string }) {
    return this.enrollmentsService.leaveRoom(body.roomId, body.studentId);
  }
}


