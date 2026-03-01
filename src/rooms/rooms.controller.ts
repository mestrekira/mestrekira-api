import {
  Controller,
  Get,
  Post,
  Patch,
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

  // ----------------------------------------------------
  // Helpers (robustos: id pode vir como id | userId | sub)
  // ----------------------------------------------------
  private norm(v: any) {
    const s = String(v ?? '').trim();
    return s && s !== 'undefined' && s !== 'null' ? s : '';
  }

  private getTokenUser(req: Request) {
    const u: any = (req as any)?.user || {};
    const id = this.norm(u.id || u.userId || u.sub);
    const role = String(u.role || '').trim().toLowerCase();
    return { id, role };
  }

  private ensureProfessor(req: Request) {
    const { id, role } = this.getTokenUser(req);
    if (role !== 'professor') {
      throw new ForbiddenException('Apenas professores podem acessar este recurso.');
    }
    if (!id) throw new BadRequestException('Sessão inválida.');
    return id;
  }

  private ensureSchool(req: Request) {
    const { id, role } = this.getTokenUser(req);
    if (role !== 'school') {
      throw new ForbiddenException('Apenas escolas podem acessar este recurso.');
    }
    if (!id) throw new BadRequestException('Sessão inválida.');
    return id;
  }

  /**
   * ✅ Garante que a sala existe e pertence ao professor logado
   * (compatibilidade: salas de escola usam professorId=teacherId, então o professor acessa normalmente)
   */
  private async ensureProfessorOwnsRoom(req: Request, roomId: string) {
    const professorId = this.ensureProfessor(req);

    const rid = this.norm(roomId);
    if (!rid) throw new BadRequestException('roomId inválido.');

    const room = await this.roomsService.findById(rid);
    if (!room) throw new BadRequestException('Sala não encontrada.');

    if (String((room as any).professorId || '').trim() !== professorId) {
      throw new ForbiddenException('Você não tem acesso a esta sala.');
    }

    return { professorId, room };
  }

  /**
   * ✅ Garante que a sala existe e pertence à escola logada
   * (ownerType='SCHOOL' e schoolId = id da escola)
   */
  private async ensureSchoolOwnsRoom(req: Request, roomId: string) {
    const schoolId = this.ensureSchool(req);

    const rid = this.norm(roomId);
    if (!rid) throw new BadRequestException('roomId inválido.');

    const room = await this.roomsService.findById(rid);
    if (!room) throw new BadRequestException('Sala não encontrada.');

    if (String((room as any).schoolId || '').trim() !== schoolId) {
      throw new ForbiddenException('Você não tem acesso a esta sala.');
    }

    return { schoolId, room };
  }

  // ============================================================
  // PROFESSOR (fluxo atual)
  // ============================================================

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
   * (Se aluno precisar, crie endpoint específico protegido por role student.)
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

  // ============================================================
  // ESCOLA (painel escolar)
  // - criar/listar/renomear/excluir salas
  // - filtro por ano letivo (schoolYearId)
  // ============================================================

  /**
   * ✅ Criar sala via painel escolar
   * body: { name, teacherId, schoolYearId? }
   * - schoolId vem do JWT (role=school)
   */
  @Post('school')
  async createBySchool(
    @Req() req: Request,
    @Body() body: { name?: string; teacherId?: string; schoolYearId?: string | null },
  ) {
    const schoolId = this.ensureSchool(req);

    const name = this.norm(body?.name);
    const teacherId = this.norm(body?.teacherId);
    const schoolYearId = body?.schoolYearId ? this.norm(body.schoolYearId) : null;

    if (!name || !teacherId) {
      throw new BadRequestException('name e teacherId são obrigatórios.');
    }

    return this.roomsService.createBySchool({
      name,
      schoolId,
      teacherId,
      schoolYearId,
    });
  }

  /**
   * ✅ Listar salas da escola (com filtro opcional por ano letivo)
   * GET /rooms/by-school?schoolYearId=...
   */
  @Get('by-school')
  async listBySchool(@Req() req: Request, @Query('schoolYearId') schoolYearId?: string) {
    const schoolId = this.ensureSchool(req);

    const year = this.norm(schoolYearId);
    return this.roomsService.listBySchool({
      schoolId,
      schoolYearId: year || null,
    });
  }

  /**
   * ✅ Renomear sala (somente escola dona)
   * PATCH /rooms/:id/school-rename  body: { name }
   */
  @Patch(':id/school-rename')
  async renameBySchool(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('name') name: string,
  ) {
    const schoolId = this.ensureSchool(req);

    const rid = this.norm(id);
    const n = this.norm(name);

    if (!rid) throw new BadRequestException('id é obrigatório.');
    if (!n) throw new BadRequestException('name é obrigatório.');

    // garante ownership (mensagem melhor)
    await this.ensureSchoolOwnsRoom(req, rid);

    return this.roomsService.renameBySchool({ schoolId, roomId: rid, name: n });
  }

  /**
   * ✅ Excluir sala (somente escola dona)
   * DELETE /rooms/:id/by-school
   */
  @Delete(':id/by-school')
  async removeBySchool(@Req() req: Request, @Param('id') id: string) {
    const schoolId = this.ensureSchool(req);

    const rid = this.norm(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    // garante ownership (mensagem melhor)
    await this.ensureSchoolOwnsRoom(req, rid);

    return this.roomsService.removeBySchool({ schoolId, roomId: rid });
  }

  /**
   * ✅ Overview da sala para a escola (somente dona)
   * GET /rooms/:id/overview-school
   * (retorna createdAt, teacherNameSnapshot etc. do serviço)
   */
  @Get(':id/overview-school')
  async overviewSchool(@Req() req: Request, @Param('id') id: string) {
    const rid = this.norm(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    await this.ensureSchoolOwnsRoom(req, rid);
    return this.roomsService.overview(rid);
  }
}
