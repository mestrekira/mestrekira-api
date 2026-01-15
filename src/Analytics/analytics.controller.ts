import { Controller, Get, Param, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('room/:roomId/essays')
  roomEssays(
    @Param('roomId') roomId: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.analyticsService.roomEssays(roomId, studentId);
  }
}
