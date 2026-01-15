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

  // ✅ BUSCAR SALA PELO CÓDIGO (vem antes do :id)
  @Get('by-code')
  findByCode(@Query('code') code: string) {
    return this.roomsService.findByCode(code);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.roomsService.findById(id);
  }

  // ✅ excluir sala (agora é exclusão completa)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.roomsService.remove(id);
  }
}
