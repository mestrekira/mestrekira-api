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
    const rid = String(roomId || '').trim();
    const sid = String(studentId || '').trim();

    if (!rid || !sid) {
      throw new BadRequestException('roomId e studentId são obrigatórios.');
    }

    // ✅ endpoint real do seu EssaysService
    const essaysRaw = await this.essaysService.performanceByRoomForStudent(
      rid,
      sid,
    );
    const essaysArr = Array.isArray(essaysRaw) ? essaysRaw : [];

    // ✅ wrapper real do TasksService
    const tasksRaw = await this.tasksService.byRoom(rid);
    const tasksArr = Array.isArray(tasksRaw) ? tasksRaw : [];

    // ✅ fallback profissional (sem depender de join)
    const studentName = `Aluno ${sid.slice(0, 6)}…`;
    const roomName = `Sala ${rid.slice(0, 6)}…`;

    // ✅ chama o PdfService com o shape EXATO esperado no seu tipo atual
    const pdfBuffer = await this.pdfService.generateStudentPerformancePdf({
      studentName,
      roomName,
      essays: essaysArr as any, // mantém compatível mesmo se o retorno não tipar igual ao PDF
      tasks: tasksArr as any,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="desempenho-${sid}.pdf"`,
    );
    res.send(pdfBuffer);
  }
}
