import {
  Controller,
  Post,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { CleanupService } from './cleanup.service';

@Controller('admin/cleanup')
export class CleanupController {
  constructor(private readonly cleanup: CleanupService) {}

  /**
   * Endpoint chamado pelo CRON
   * Header obrigatório: x-cleanup-secret
   * Exemplo:
   * POST /admin/cleanup/inactive?days=90&warnDays=7
   */
  @Post('inactive')
  async run(
    @Query('days') daysQ: string,
    @Query('warnDays') warnQ: string,
    @Headers('x-cleanup-secret') secret: string,
  ) {
    if (!process.env.CLEANUP_SECRET || secret !== process.env.CLEANUP_SECRET) {
      throw new UnauthorizedException('unauthorized');
    }

    const days = Math.max(1, Number(daysQ || 90));
    const warnDays = Math.max(1, Number(warnQ || 7));

    return this.cleanup.runInactiveCleanup(days, warnDays);
  }
}
