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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PdfService } from './pdf.service';
import { EssaysService } from '../essays/essays.service';
import { TasksService } from '../tasks/tasks.service';
import { RoomsService } from '../rooms/rooms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserEntity } from '../users/user.entity';

@Controller('pdf')
@UseGuards(JwtAuthGuard)
export class PdfController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly essaysService: EssaysService,
    private readonly tasksService: TasksService,
    private readonly roomsService: RoomsService,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  @Get('student-performance')
  async studentPerformance(
    @Query('roomId') roomId: string,
    @Query('studentId') studentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const rid = String(roomId || '').trim();
    const sid = String(studentId || '').trim();

    if (!rid || !sid) {
      throw new BadRequestException('roomId e studentId são obrigatórios.');
    }

    // ✅ segurança: estudante só pode gerar o PRÓPRIO PDF
    const user: any = (req as any).user || {};
    const tokenStudentId = String(user.sub || user.userId || user.id || '').trim();

    if (!tokenStudentId) {
      throw new ForbiddenException('Token inválido.');
    }

    if (tokenStudentId !== sid) {
      throw new ForbiddenException(
        'Você não tem permissão para gerar o PDF de outro estudante.',
      );
    }

    // ✅ sala real
    const room = await this.roomsService.findById(rid);
    const roomName = room?.name || `Sala ${rid.slice(0, 6)}…`;

    // ✅ estudante real
    const student = await this.userRepo.findOne({ where: { id: sid } });
    const studentName = student?.name || `Estudante ${sid.slice(0, 6)}…`;

    // ✅ pega redações completas (com content)
    const essaysArr =
      await this.essaysService.findEssaysWithContentByRoomForStudent(rid, sid);

    // ✅ tarefas da sala (pra mapear title)
    const tasksRaw = await this.tasksService.byRoom(rid);
    const tasksArr = Array.isArray(tasksRaw) ? tasksRaw : [];

    const pdfBuffer = await this.pdfService.generateStudentPerformancePdf({
      studentName,
      roomName,
      essays: essaysArr as any,
      tasks: tasksArr as any,
    });

    // ---------- headers robustos ----------
    // Nome “bonito” sem quebrar em Windows/Chrome
    const safeBase = `desempenho-${sid}`; // simples e seguro
    const fileName = `${safeBase}.pdf`;

    // RFC 5987 (permite unicode corretamente)
    const fileNameStar = `UTF-8''${encodeURIComponent(fileName)}`;

    res.status(200);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', Buffer.byteLength(pdfBuffer));

    // download + nome
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=${fileNameStar}`,
    );

    // evita cache quebrando “PDF antigo”
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // CORS: permite que o frontend (fetch) leia Content-Disposition
    // (se seu backend está em domínio diferente do front)
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');

    // importante: encerra corretamente
    return res.end(pdfBuffer);
  }
}
