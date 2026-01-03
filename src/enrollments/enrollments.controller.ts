import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  @Post()
  enroll(
    @Body('studentId') studentId: string,
    @Body('roomId') roomId: string,
  ) {
    return this.enrollmentsService.enroll(studentId, roomId);
  }

  @Get('by-room')
  findByRoom(@Query('roomId') roomId: string) {
    return this.enrollmentsService.findByRoom(roomId);
  }

  @Get('by-student')
  findByStudent(@Query('studentId') studentId: string) {
    return this.enrollmentsService.findByStudent(studentId);
  }
}
