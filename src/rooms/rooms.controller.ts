import { Controller, Get, Post, Body, Query, Param, Delete } from '@nestjs/common';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  create(@Body('name') name: string, @Body('professorId') professorId: string) {
    return this.roomsService.create(name, professorId);
  }

  @Get('by-professor')
  findByProfessor(@Query('professorId') professorId: string) {
    return this.roomsService.findByProfessor(professorId);
  }

  @Get('by-code')
  findByCode(@Query('code') code: string) {
    return this.roomsService.findByCode(code);
  }

  // ✅ Alunos matriculados (nome/email)
  @Get(':id/students')
  students(@Param('id') id: string) {
    return this.roomsService.findStudents(id);
  }

  // ✅ Remover aluno da sala (professor)
  @Delete(':roomId/students/:studentId')
  removeStudent(
    @Param('roomId') roomId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.roomsService.removeStudent(roomId, studentId);
  }

  // ✅ Overview (professor + colegas)
  @Get(':id/overview')
  overview(@Param('id') id: string) {
    return this.roomsService.overview(id);
  }

  // ✅ Opcional: sala + professor (leve)
  @Get(':id/with-professor')
  withProfessor(@Param('id') id: string) {
    return this.roomsService.withProfessor(id);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.roomsService.findById(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.roomsService.remove(id);
  }
}
