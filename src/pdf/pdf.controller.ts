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
import { UsersService } from '../users/users.service';
import { RoomsService } from '../rooms/rooms.service';
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
    private readonly usersService: UsersService,
    private readonly roomsService: RoomsService,
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

    // ✅ quem está autenticado
    const user: any = (req as any).user;
    const role = normRole(user?.role);

    // ✅ STUDENT só pode baixar o próprio
    if (role === 'STUDENT' || role === 'ALUNO') {
      if (String(user?.id) !== String(studentId)) {
        throw new ForbiddenException('Você não tem permissão para baixar este PDF.');
      }
    }

    // 1) redações do aluno na sala
    const essays = await this.essaysService.performanceByRoomForStudent(roomId, studentId);

    // 2) tarefas (para mapear títulos)
    const tasks = await this.tasksService.byRoom(roomId);

    // 3) nomes bonitos (profissional)
    const student = await this.usersService.findById(studentId);
    const room = await this.roomsService.findById(roomId);

    const studentName = student?.name || 'Aluno';
    const roomName = room?.name || 'Sala';

    const pdfBuffer = await this.pdfService.generateStudentPerformancePdf({
      studentName,
      roomName,
      essays: Array.isArray(essays) ? essays : [],
      tasks: Array.isArray(tasks) ? tasks : [],
    });

    const safeStudent = String(studentName).replace(/[^\w\d-_]+/g, '_');
    const safeRoom = String(roomName).replace(/[^\w\d-_]+/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="desempenho-${safeStudent}-${safeRoom}.pdf"`,
    );
    res.send(pdfBuffer);
  }
}
