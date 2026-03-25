import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';

import { Request } from 'express';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

function norm(v: any) {
  const s = String(v ?? '').trim();
  return s && s !== 'undefined' && s !== 'null' ? s : '';
}

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  // ======================================================
  // HELPERS
  // ======================================================

  private getUser(req: Request) {
    return (req as any).user;
  }

  private ensureSchool(req: Request) {
    const user = this.getUser(req);
    const role = String(user?.role || '').toLowerCase();

    if (role !== 'school' && role !== 'escola') {
      throw new BadRequestException('Apenas escolas podem executar esta ação.');
    }

    return String(user.id);
  }

  // ======================================================
  // FIND
  // ======================================================

  @Get(':id')
  async findById(@Param('id') id: string) {
    const rid = norm(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    return this.roomsService.findById(rid);
  }

  @Get(':id/students')
  async students(@Param('id') id: string) {
    const rid = norm(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    return this.roomsService.findStudents(rid);
  }

  @Get(':id/overview-student')
  async overviewStudent(@Param('id') id: string) {
    const rid = norm(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    return this.roomsService.overview(rid);
  }

  // ======================================================
  // CREATE
  // ======================================================

  @Post()
  async create(
    @Body() body: { name?: string; professorId?: string },
  ) {
    const name = norm(body?.name);
    const professorId = norm(body?.professorId);

    if (!name || !professorId) {
      throw new BadRequestException('name e professorId são obrigatórios.');
    }

    return this.roomsService.create(name, professorId);
  }

  // ======================================================
  // 🔥 TOGGLE ATIVO / INATIVO (ESSENCIAL)
  // ======================================================

  @Patch(':id/toggle-active')
  async toggleActive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    const schoolId = this.ensureSchool(req);

    const rid = norm(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    return this.roomsService.toggleActive({
      roomId: rid,
      schoolId,
      isActive: !!isActive,
    });
  }

  // ======================================================
  // DELETE
  // ======================================================

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const schoolId = this.ensureSchool(req);

    const rid = norm(id);
    if (!rid) throw new BadRequestException('id é obrigatório.');

    return this.roomsService.removeBySchool({
      schoolId,
      roomId: rid,
    });
  }
}
