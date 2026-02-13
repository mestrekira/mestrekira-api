import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PdfService } from './pdf.service';
import { EssaysService } from '../essays/essays.service';
import { TasksService } from '../tasks/tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('pdf')
@UseGuards(JwtAuthGuard)
export class PdfController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly essaysService: EssaysService,
    private readonly tasksService: TasksService,
  ) {}

  @Get('student-performance')
  async studentPerformance(
    @Query('roomId') roomId: string,
    @Query('studentId') studentId: string,
    @Res() res: Response,
  ) {
    if (!roomId || !studentId) {
      throw new BadRequestException('roomId e studentId são obrigatórios.');
    }

    // ✅ método real do seu EssaysService (você confirmou no log do Render)
    const essays = await this.essaysService.performanceByRoomForStudent(
      roomId,
      studentId,
    );

    // ✅ wrapper que você criou no TasksService
    const tasks = await this.tasksService.byRoom(roomId);

    // ✅ este método precisa existir no PdfService
    const pdfBuffer = await this.pdfService.generateStudentPerformancePdf({
      roomId,
      studentId,
      essays: Array.isArray(essays) ? essays : [],
      tasks: Array.isArray(tasks) ? tasks : [],
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="desempenho-${studentId}.pdf"`,
    );
    res.send(pdfBuffer);
  }
}
