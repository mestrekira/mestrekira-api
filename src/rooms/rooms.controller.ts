import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  create(
    @Body('name') name: string,
    @Body('professorId') professorId: string,
  ) {
    return this.roomsService.create(name, professorId);
  }

  @Get()
  findAll() {
    return this.roomsService.findAll();
  }

  @Get('by-professor')
  findByProfessor(@Query('professorId') professorId: string) {
    return this.roomsService.findByProfessor(professorId);
  }

  // 🔹 NOVO: dados da sala
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomsService.findById(id);
  }

  // 🔹 NOVO: alunos da sala
  @Get(':id/students')
  findStudents(@Param('id') id: string) {
    return this.roomsService.findStudents(id);
  }
}
