import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { PdfService } from './pdf.service';
import { EssaysService } from '../essays/essays.service';
import { TasksService } from '../tasks/tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

function normRole(role: any) {
  return String(role || '').trim().toUpperCase();
}

@Controller('pdf')
export class PdfController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly essaysService: EssaysService,
    private readonly tasksService: TasksService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('student-performance')
  async studentPerformance(
    @Query('roomId') roomId: string,
    @Query('studentId') studentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!roomId || !studentId) {
      throw new BadRequestException('roomId e studentId são obrigatórios.');
    }

    const user: any = (req as any).user;
    const role = normRole(user?.role);

    if (role === 'STUDENT' || role === 'ALUNO') {
      if (String(user?.id) !== String(studentId)) {
        throw new ForbiddenException('Você não tem permissão para baixar este PDF.');
      }
    }

    const essays = await this.essaysService.performanceByRoomForStudent(roomId, studentId);
    const tasks = await this.tasksService.byRoom(roomId);

    const pdfBuffer = await this.pdfService.generateStudentPerformancePdf({
      studentName: 'Aluno', // depois a gente liga no UsersService se você quiser
      roomName: 'Sala',
      essays: Array.isArray(essays) ? essays : [],
      tasks: Array.isArray(tasks) ? tasks : [],
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="desempenho-${studentId}.pdf"`);
    res.send(pdfBuffer);
  }
}
