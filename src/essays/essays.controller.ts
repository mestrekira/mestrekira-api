import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { EssaysService } from './essays.service';

@Controller('essays')
export class EssaysController {
  constructor(private readonly essaysService: EssaysService) {}

  @Post()
  create(@Body() body: any) {
    const { taskId, studentId, content } = body;
    return this.essaysService.create(taskId, studentId, content);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.essaysService.findOne(id);
  }
  
@Get('by-task/:taskId/with-student')
findByTaskWithStudent(@Param('taskId') taskId: string) {
  return this.essaysService.findByTaskWithStudent(taskId);
}
  
  @Post(':id/correct')
correctEssay(
  @Param('id') id: string,
  @Body() body: { feedback: string; score: number },
) {
  return this.essaysService.correct(id, body.feedback, body.score);
}

  @Get('by-task/:taskId')
  findByTask(@Param('taskId') taskId: string) {
    return this.essaysService.findByTask(taskId);
  }
}


