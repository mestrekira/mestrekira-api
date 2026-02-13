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

function clamp0to200(n: any) {
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(200, v));
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

    // ✅ método real do seu EssaysService
    const essaysRaw = await this.essaysService.performanceByRoomForStudent(
      rid,
      sid,
    );

    const essaysArr = Array.isArray(essaysRaw) ? essaysRaw : [];

    // ✅ tasks da sala para mapear título no PDF
    const tasksRaw = await this.tasksService.byRoom(rid);
    const tasksArr = Array.isArray(tasksRaw) ? tasksRaw : [];

    const taskTitleMap = new Map<string, string>();
    tasksArr.forEach((t: any) => {
      if (t?.id) taskTitleMap.set(String(t.id), String(t.title || 'Tarefa'));
    });

    // ✅ normaliza/“enriquece” as redações para o PDF
    const essaysForPdf = essaysArr.map((e: any) => {
      const taskIdStr = String(e?.taskId || '').trim();
      return {
        id: String(e?.id || ''),
        taskId: taskIdStr,
        taskTitle:
          String(e?.taskTitle || '').trim() ||
          taskTitleMap.get(taskIdStr) ||
          (taskIdStr ? `Tarefa ${taskIdStr.slice(0, 6)}…` : 'Tarefa'),

        score: e?.score ?? null,
        c1: e?.c1 ?? null,
        c2: e?.c2 ?? null,
        c3: e?.c3 ?? null,
        c4: e?.c4 ?? null,
        c5: e?.c5 ?? null,

        // ✅ inclui a redação (você disse que NÃO precisa do feedback agora)
        content: e?.content ?? null,

        // Mantém campos de data caso existam (não atrapalha)
        submittedAt: e?.submittedAt ?? e?.submitted_at ?? null,
        createdAt: e?.createdAt ?? e?.created_at ?? null,
        updatedAt: e?.updatedAt ?? e?.updated_at ?? null,
      };
    });

    // ✅ médias apenas das corrigidas (igual seu front)
    const corrected = essaysForPdf.filter(
      (e: any) => e?.score !== null && e?.score !== undefined,
    );

    const averages = {
      total: mean(corrected.map((e: any) => e.score)),
      c1: mean(corrected.map((e: any) => e.c1)),
      c2: mean(corrected.map((e: any) => e.c2)),
      c3: mean(corrected.map((e: any) => e.c3)),
      c4: mean(corrected.map((e: any) => e.c4)),
      c5: mean(corrected.map((e: any) => e.c5)),
    };

    // ✅ nomes (tentamos pegar do payload; se não vier, usa fallback bonito)
    const studentName =
      String(essaysArr?.[0]?.studentName || essaysArr?.[0]?.student?.name || '')
        .trim() || `Aluno ${sid.slice(0, 6)}…`;

    // Se seu back não retorna roomName, fica um fallback consistente
    const roomName =
      String(essaysArr?.[0]?.roomName || essaysArr?.[0]?.room?.name || '')
        .trim() || `Sala ${rid.slice(0, 6)}…`;

    // ✅ CHAMA O MÉTODO QUE EXISTE NO SEU PdfService (pdf.service.ts)
    const pdfBuffer = await this.pdfService.performancePdf({
      studentName,
      roomName,
      essays: essaysForPdf.map((e: any) => ({
        ...e,
        // garante números “seguros” para o gráfico
        c1: e.c1 === null ? null : clamp0to200(e.c1),
        c2: e.c2 === null ? null : clamp0to200(e.c2),
        c3: e.c3 === null ? null : clamp0to200(e.c3),
        c4: e.c4 === null ? null : clamp0to200(e.c4),
        c5: e.c5 === null ? null : clamp0to200(e.c5),
      })),
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
