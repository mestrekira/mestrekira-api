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

function mean(nums: Array<number | null | undefined>): number | null {
  const v = (Array.isArray(nums) ? nums : [])
    .map((n) => (n === null || n === undefined ? null : Number(n)))
    .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));

  if (v.length === 0) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

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

    // ✅ retorna somente dados da redação (sem join de aluno/sala)
    const essaysRaw = await this.essaysService.performanceByRoomForStudent(
      rid,
      sid,
    );

    const essaysArr = Array.isArray(essaysRaw) ? essaysRaw : [];

    // ✅ tarefas da sala para mapear título
    const tasksRaw = await this.tasksService.byRoom(rid);
    const tasksArr = Array.isArray(tasksRaw) ? tasksRaw : [];

    const taskTitleMap = new Map<string, string>();
    tasksArr.forEach((t: any) => {
      if (t?.id) taskTitleMap.set(String(t.id), String(t.title || 'Tarefa'));
    });

    // ✅ títulos reais não vêm no payload -> fallback profissional
    const studentName = `Aluno ${sid.slice(0, 6)}…`;
    const roomName = `Sala ${rid.slice(0, 6)}…`;

    // ✅ monta objeto pro PDF (incluindo content se existir)
    const essaysForPdf = essaysArr.map((e: any, idx: number) => {
      const taskIdStr = String(e?.taskId || '').trim();
      const taskTitle =
        taskTitleMap.get(taskIdStr) ||
        (taskIdStr ? `Tarefa ${taskIdStr.slice(0, 6)}…` : `Tarefa ${idx + 1}`);

      return {
        id: String(e?.id || ''),
        taskId: taskIdStr,
        taskTitle,

        score: e?.score ?? null,
        c1: e?.c1 ?? null,
        c2: e?.c2 ?? null,
        c3: e?.c3 ?? null,
        c4: e?.c4 ?? null,
        c5: e?.c5 ?? null,

        // ✅ se o seu endpoint não traz content, fica null e o PDF só mostra gráficos
        content: e?.content ?? null,

        submittedAt: e?.submittedAt ?? null,
        createdAt: e?.createdAt ?? null,
        updatedAt: e?.updatedAt ?? null,
      };
    });

    // ✅ médias apenas corrigidas
    const corrected = essaysForPdf.filter(
      (e) => e.score !== null && e.score !== undefined,
    );

    const averages = {
      total: mean(corrected.map((e) => e.score)),
      c1: mean(corrected.map((e) => e.c1)),
      c2: mean(corrected.map((e) => e.c2)),
      c3: mean(corrected.map((e) => e.c3)),
      c4: mean(corrected.map((e) => e.c4)),
      c5: mean(corrected.map((e) => e.c5)),
    };

    // ✅ chama o gerador final do PDF
    const pdfBuffer = await this.pdfService.generateStudentPerformancePdf({
      studentName,
      roomName,
      essays: essaysForPdf,
      averages,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="desempenho-${sid}.pdf"`,
    );
    res.send(pdfBuffer);
  }
}
