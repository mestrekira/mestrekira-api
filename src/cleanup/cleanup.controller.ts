import {
  Controller,
  Post,
  Query,
  Headers,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { CleanupService } from './cleanup.service';

@Controller('admin/cleanup')
export class CleanupController {
  constructor(private readonly cleanup: CleanupService) {}

  /**
   * Endpoint chamado pelo CRON
   * Header obrigatório: x-cleanup-secret
   *
   * Ex:
   * POST /admin/cleanup/inactive?days=90&warnDays=7&maxWarnings=200
   */
  @Post('inactive')
  async run(
    @Query('days') daysQ: string,
    @Query('warnDays') warnQ: string,
    @Query('maxWarnings') maxWarningsQ: string,
    @Headers('x-cleanup-secret') secret?: string,
  ) {
    const expected = String(process.env.CLEANUP_SECRET || '').trim();
    const incoming = String(secret || '').trim();

    if (!expected || incoming !== expected) {
      throw new UnauthorizedException('unauthorized');
    }

    // ✅ limites seguros (evita "days=1" acidental)
    let days = Number(daysQ ?? 90);
    let warnDays = Number(warnQ ?? 7);
    let maxWarnings = Number(maxWarningsQ ?? 200);

    if (!Number.isFinite(days)) days = 90;
    if (!Number.isFinite(warnDays)) warnDays = 7;
    if (!Number.isFinite(maxWarnings)) maxWarnings = 200;

    days = Math.max(30, Math.min(3650, Math.floor(days))); // 30..3650
    warnDays = Math.max(1, Math.min(days - 1, Math.floor(warnDays))); // 1..days-1
    maxWarnings = Math.max(1, Math.min(5000, Math.floor(maxWarnings))); // 1..5000

    // (opcional) impedir warnDays muito grande
    if (warnDays >= days) {
      throw new BadRequestException('warnDays deve ser menor que days.');
    }

    return this.cleanup.runInactiveCleanup(days, warnDays, maxWarnings);
  }
}
