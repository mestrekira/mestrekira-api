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

    // JwtStrategy retorna { id, role }
    const id = String((req as any)?.user?.id || '').trim();
    if (!id) throw new BadRequestException('Sessão inválida.');

    return id;
  }

  /**
   * ✅ Garante que a sala existe e pertence ao professor logado
   */
  private async ensureProfessorOwnsRoom(req: Request, roomId: string) {
    const professorId = this.ensureProfessor(req);

    const rid = String(roomId || '').trim();
    if (!rid) throw new BadRequestException('roomId inválido.');

    const room = await this.roomsService.findById(rid);
    if (!room) throw new BadRequestException('Sala não encontrada.');

    if (String((room as any).professorId || '').trim() !== professorId) {
      throw new ForbiddenException('Você não tem acesso a esta sala.');
    }

    return { professorId, room };
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
   * ✅ Buscar por código (mantido protegido para evitar enumeração)
   * Se aluno precisar, use /enrollments/join
   */
  @Get('by-code')
  findByCode(@Req() req: Request, @Query('code') code: string) {
    this.ensureProfessor(req);
    return this.roomsService.findByCode(code);
  }

  // ✅ Alunos matriculados (professor + ownership)
  @Get(':id/students')
  async students(@Req() req: Request, @Param('id') id: string) {
    await this.ensureProfessorOwnsRoom(req, id);
    return this.roomsService.findStudents(id);
  }

  // ✅ Remover aluno da sala (professor + ownership)
  @Delete(':roomId/students/:studentId')
  async removeStudent(
    @Req() req: Request,
    @Param('roomId') roomId: string,
    @Param('studentId') studentId: string,
  ) {
    await this.ensureProfessorOwnsRoom(req, roomId);
    return this.roomsService.removeStudent(roomId, studentId);
  }

  // ✅ Overview (professor + ownership)
  @Get(':id/overview')
  async overview(@Req() req: Request, @Param('id') id: string) {
    await this.ensureProfessorOwnsRoom(req, id);
    return this.roomsService.overview(id);
  }

  // ✅ Sala + professor (professor + ownership)
  @Get(':id/with-professor')
  async withProfessor(@Req() req: Request, @Param('id') id: string) {
    await this.ensureProfessorOwnsRoom(req, id);
    return this.roomsService.withProfessor(id);
  }

  /**
   * ✅ Buscar sala por id (professor + ownership)
   * Se aluno precisar, crie endpoint específico protegido por role student.
   */
  @Get(':id')
  async findById(@Req() req: Request, @Param('id') id: string) {
    await this.ensureProfessorOwnsRoom(req, id);
    return this.roomsService.findById(id);
  }

  // ✅ Remover sala (professor + ownership)
  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.ensureProfessorOwnsRoom(req, id);
    return this.roomsService.remove(id);
  }
}
