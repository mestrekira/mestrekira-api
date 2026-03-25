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
    if (role !== 'school' && role !== 'escola') {
      throw new ForbiddenException('Apenas escolas podem acessar este recurso.');
    }
    if (!id) throw new BadRequestException('Sessão inválida.');
    return id;
  }

  private ensureStudent(req: Request) {
    const { id, role } = this.getTokenUser(req);
    if (role !== 'student' && role !== 'aluno') {
      throw new ForbiddenException('Apenas alunos podem acessar este recurso.');
    }
    if (!id) throw new BadRequestException('Sessão inválida.');
    return id;
  }

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

  private async ensureStudentInRoom(req: Request, roomId: string) {
    const studentId = this.ensureStudent(req);

    const rid = this.norm(roomId);
    if (!rid) throw new BadRequestException('roomId inválido.');

    const room = await this.roomsService.findById(rid);
    if (!room) throw new BadRequestException('Sala não encontrada.');

    const students = await this.roomsService.findStudents(rid);
    const isEnrolled = Array.isArray(students)
      ? students.some((s: any) => String(s?.id || '').trim() === studentId)
      : false;

    if (!isEnrolled) {
      throw new ForbiddenException('Você não participa desta sala.');
    }

    return { studentId, room };
  }

  // ======================================================
  // ROTAS FIXAS PRIMEIRO
  // ======================================================

  @Post()
  create(@Req() req: Request, @Body('name') name: string) {
    const professorId = this.ensureProfessor(req);
    return this.roomsService.create(name, professorId);
  }

  @Get('by-professor')
  findByProfessor(@Req() req: Request) {
    const professorId = this.ensureProfessor(req);
    return this.roomsService.findByProfessor(professorId);
  }

  @Get('by-code')
  findByCode(@Req() req: Request, @Query('code') code: string) {
    this.ensureProfessor(req);
    return this.roomsService.findByCode(code);
  }

  @Post('school')
  async createBySchool(
    @Req() req: Request,
    @Body() body: { name?: string; teacherId?: string; schoolYearId?: string | null },
  ) {
    const schoolId = this.ensureSchool(req);

    const name = this.norm(body?.name);
    const teacherId = this.norm(body?.teacherId);
    const schoolYearId = body?.schoolYearId ? this.norm(body.schoolYearId) : undefined;

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

  @Get('by-school')
  async listBySchool(@Req() req: Request, @Query('schoolYearId') schoolYearId?: string) {
    const schoolId = this.ensureSchool(req);

    const year = this.norm(schoolYearId);
    return this.roomsService.listBySchool({
      schoolId,
      schoolYearId: year || undefined,
    });
  }

  // ======================================================
  // ROTAS DE AÇÃO EM SALAS
  // ======================================================

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

    await this.ensureSchoolOwnsRoom(req, rid);

    return this.roomsService.renameBySchool({ schoolId, roomId: rid, name: n });
  }

  @Patch(':id/toggle-active')
  async toggleActive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    const schoolId = this.ensureSchool(req);

    const rid = this.norm(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    return this.roomsService.toggleActive({
      roomId: rid,
      schoolId,
      isActive: !!isActive,
    });
  }

  @Delete(':id/by-school')
  async removeBySchool(@Req() req: Request, @Param('id') id: string) {
    const schoolId = this.ensureSchool(req);

    const rid = this.norm(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    await this.ensureSchoolOwnsRoom(req, rid);

    return this.roomsService.removeBySchool({ schoolId, roomId: rid });
  }

  @Get(':id/students')
  async students(@Req() req: Request, @Param('id') id: string) {
    await this.ensureProfessorOwnsRoom(req, id);
    return this.roomsService.findStudents(id);
  }

  @Delete(':roomId/students/:studentId')
  async removeStudent(
    @Req() req: Request,
    @Param('roomId') roomId: string,
    @Param('studentId') studentId: string,
  ) {
    await this.ensureProfessorOwnsRoom(req, roomId);
    return this.roomsService.removeStudent(roomId, studentId);
  }

  @Get(':id/overview')
  async overview(@Req() req: Request, @Param('id') id: string) {
    await this.ensureProfessorOwnsRoom(req, id);
    return this.roomsService.overview(id);
  }

  @Get(':id/overview-student')
  async overviewStudent(@Req() req: Request, @Param('id') id: string) {
    await this.ensureStudentInRoom(req, id);
    return this.roomsService.overview(id);
  }

  @Get(':id/overview-school')
  async overviewSchool(@Req() req: Request, @Param('id') id: string) {
    const rid = this.norm(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    await this.ensureSchoolOwnsRoom(req, rid);
    return this.roomsService.overview(rid);
  }

  @Get(':id/with-professor')
  async withProfessor(@Req() req: Request, @Param('id') id: string) {
    await this.ensureProfessorOwnsRoom(req, id);
    return this.roomsService.withProfessor(id);
  }

  // ======================================================
  // ROTAS GENÉRICAS POR ÚLTIMO
  // ======================================================

  @Get(':id')
  async findById(@Req() req: Request, @Param('id') id: string) {
    await this.ensureProfessorOwnsRoom(req, id);
    return this.roomsService.findById(id);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.ensureProfessorOwnsRoom(req, id);
    return this.roomsService.remove(id);
  }
}
