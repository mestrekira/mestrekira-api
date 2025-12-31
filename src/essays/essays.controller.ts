import { Controller, Post, Get, Body, Query, Patch } from '@nestjs/common';
import { EssaysService } from './essays.service';

@Controller('essays')
export class EssaysController {
  constructor(private readonly essaysService: EssaysService) {}

  @Post()
  create(
    @Body('roomId') roomId: string,
    @Body('studentId') studentId: string,
    @Body('content') content: string,
  ) {
    return this.essaysService.create(roomId, studentId, content);
  }

  @Patch(':id')
  correct(
    @Body('id') id: string,
    @Body('feedback') feedback: string,
    @Body('score') score: number,
  ) {
    return this.essaysService.correct(id, feedback, score);
  }

  @Get('by-room')
  findByRoom(@Query('roomId') roomId: string) {
    return this.essaysService.findByRoom(roomId);
  }

  @Get('by-student')
  findByStudent(@Query('studentId') studentId: string) {
    return this.essaysService.findByStudent(studentId);
  }
}
