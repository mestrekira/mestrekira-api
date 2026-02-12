import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { PdfService } from './pdf.service';
import { EssaysService } from '../essays/essays.service';
import { TasksService } from '../tasks/tasks.service';

@Controller('pdf')
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

    // ✅ CORRIGIDO: o método do seu service é performanceByRoomForStudent
    const essays = await this.essaysService.performanceByRoomForStudent(
      roomId,
      studentId,
    );

    // ✅ CORRIGIDO: implementamos tasksService.byRoom(roomId) (wrapper)
    const tasks = await this.tasksService.byRoom(roomId);

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
