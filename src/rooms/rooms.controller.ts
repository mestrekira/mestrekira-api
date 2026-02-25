import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Delete,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { RoomsService } from './rooms.service';
import { MustChangePasswordGuard } from '../auth/guards/must-change-password.guard';

@Controller('rooms')
@UseGuards(AuthGuard('jwt'), MustChangePasswordGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  private ensureProfessor(req: Request) {
    const role = String((req as any)?.user?.role || '').toLowerCase();
    if (role !== 'professor') {
      throw new ForbiddenException('Apenas professores podem acessar este recurso.');
    }
    const id = String((req as any)?.user?.id || '').trim();
    if (!id) throw new BadRequestException('Sessão inválida.');
    return id;
  }

  /**
   * ✅ Criação de sala (professor):
   * - professorId vem do JWT
   * - regras de limite ficam no service
   */
  @Post()
  create(@Req() req: Request, @Body('name') name: string) {
    const professorId = this.ensureProfessor(req);
    return this.roomsService.create(name, professorId);
  }

  /**
   * ✅ Listar salas do professor logado
   * - ignora query professorId (segurança)
   */
  @Get('by-professor')
  findByProfessor(@Req() req: Request) {
    const professorId = this.ensureProfessor(req);
    return this.roomsService.findByProfessor(professorId);
  }

  /**
   * ✅ Buscar por código (aluno normalmente usa /enrollments/join)
   * Mantive protegido aqui para não virar endpoint público de enumeração.
   * Se você precisa que aluno consulte por código diretamente,
   * a forma segura é via /enrollments/join (que já valida role=student).
   */
  @Get('by-code')
  findByCode(@Req() req: Request, @Query('code') code: string) {
    // permite professor ver por code
    this.ensureProfessor(req);
    return this.roomsService.findByCode(code);
  }

  // ✅ Alunos matriculados (professor)
  @Get(':id/students')
  students(@Req() req: Request, @Param('id') id: string) {
    this.ensureProfessor(req);
    return this.roomsService.findStudents(id);
  }

  // ✅ Remover aluno da sala (professor)
  @Delete(':roomId/students/:studentId')
  removeStudent(
    @Req() req: Request,
    @Param('roomId') roomId: string,
    @Param('studentId') studentId: string,
  ) {
    this.ensureProfessor(req);
    return this.roomsService.removeStudent(roomId, studentId);
  }

  // ✅ Overview (professor)
  @Get(':id/overview')
  overview(@Req() req: Request, @Param('id') id: string) {
    this.ensureProfessor(req);
    return this.roomsService.overview(id);
  }

  // ✅ Sala + professor (leve)
  @Get(':id/with-professor')
  withProfessor(@Req() req: Request, @Param('id') id: string) {
    this.ensureProfessor(req);
    return this.roomsService.withProfessor(id);
  }

  /**
   * ✅ Buscar por id
   * Mantido para professor (se aluno precisar, crie endpoint específico protegido por role student)
   */
  @Get(':id')
  findById(@Req() req: Request, @Param('id') id: string) {
    this.ensureProfessor(req);
    return this.roomsService.findById(id);
  }

  // ✅ Remover sala (professor)
  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    this.ensureProfessor(req);
    return this.roomsService.remove(id);
  }
}
