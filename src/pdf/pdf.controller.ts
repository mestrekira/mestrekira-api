import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PdfService } from './pdf.service';

// ✅ ajuste estes imports para seus services reais:
import { EssaysService } from '../essays/essays.service';
import { RoomsService } from '../rooms/rooms.service';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';

@Controller('pdf')
export class PdfController {
  constructor(
    private readonly pdf: PdfService,
    private readonly essays: EssaysService,
    private readonly rooms: RoomsService,
    private readonly tasks: TasksService,
    private readonly users: UsersService,
  ) {}

  @Get('performance/student')
  async performanceStudent(
    @Query('roomId') roomId: string,
    @Query('studentId') studentId: string,
    @Res() res: Response,
  ) {
    // 1) pega dados (use os métodos que você já tem)
    const student = await this.users.findById(studentId); // adapte
    const room = await this.rooms.findById(roomId);       // adapte

    // seu endpoint já existe no front:
    // GET /essays/performance/by-room-for-student?roomId=&studentId=
    const essays = await this.essays.getPerformanceByRoomForStudent(roomId, studentId); // adapte

    // tarefas para mapear títulos
    const tasks = await this.tasks.byRoom(roomId); // adapte
    const tasksMap = new Map((tasks || []).map((t: any) => [String(t.id), String(t.title || 'Tarefa')]));

    // 2) calcula médias (só corrigidas)
    const corrected = (Array.isArray(essays) ? essays : []).filter((e) => e?.score !== null && e?.score !== undefined);

    const mean = (nums: any[]) => {
      const v = nums.map(Number).filter((n) => !Number.isNaN(n));
      if (!v.length) return null;
      return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
    };

    const averages = {
      total: mean(corrected.map((e) => e.score)),
      c1: mean(corrected.map((e) => e.c1)),
      c2: mean(corrected.map((e) => e.c2)),
      c3: mean(corrected.map((e) => e.c3)),
      c4: mean(corrected.map((e) => e.c4)),
      c5: mean(corrected.map((e) => e.c5)),
    };

    // 3) normaliza para o PDF incluir texto/feedback (se seu endpoint não traz, você precisa buscar por essayId)
    const enriched = (Array.isArray(essays) ? essays : []).map((e: any) => ({
      ...e,
      taskTitle: tasksMap.get(String(e.taskId)) || `Tarefa ${String(e.taskId).slice(0, 6)}…`,
      content: e.content ?? null,
      feedback: e.feedback ?? null,
    }));

    // 4) gera PDF
    const pdfBuffer = await this.pdf.performancePdf({
      studentName: student?.name || 'Aluno',
      roomName: room?.name || 'Sala',
      essays: enriched,
      averages,
    });

    const filename = `desempenho-${(student?.name || 'aluno').replace(/\s+/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  }
}
