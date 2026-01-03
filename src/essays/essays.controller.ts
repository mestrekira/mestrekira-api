import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Patch,
  Param,
} from '@nestjs/common';
import { EssaysService } from './essays.service';

@Controller('essays')
export class EssaysController {
  constructor(private readonly essaysService: EssaysService) {}

  @Post('draft')
  saveDraft(
    @Body('roomId') roomId: string,
    @Body('userId') userId: string,
    @Body('text') text: string,
  ) {
    return this.essaysService.saveDraft(roomId, userId, text);
  }

  @Post('submit')
  submitEssay(
    @Body('roomId') roomId: string,
    @Body('userId') userId: string,
    @Body('text') text: string,
  ) {
    return this.essaysService.submit(roomId, userId, text);
  }

  @Patch(':id')
  correctEssay(
    @Param('id') id: string,
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
