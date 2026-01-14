import { Controller, Get, Post, Body, Query, Param, Delete } from '@nestjs/common';
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

  @Get('by-professor')
  findByProfessor(@Query('professorId') professorId: string) {
    return this.roomsService.findByProfessor(professorId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.roomsService.findById(id);
  }

  // 🔹 BUSCAR SALA PELO CÓDIGO
  @Get('by-code')
  findByCode(@Query('code') code: string) {
    return this.roomsService.findByCode(code);
  }

  // ✅ NOVO: excluir sala
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.roomsService.remove(id);
  }
}
}

