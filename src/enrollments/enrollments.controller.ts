import { Controller, Post, Body } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('join')
  async join(@Body() body: { code: string; studentId: string }) {
    const room = await this.enrollmentsService.joinByCode(
      body.code,
      body.studentId,
    );

    return { roomId: room.id };
  }
}
