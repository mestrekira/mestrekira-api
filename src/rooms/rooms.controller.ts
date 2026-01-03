import { Controller, Post, Get, Body, Query } from '@nestjs/common';
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

  @Get()
  findAll() {
    return this.roomsService.findAll();
  }
}
