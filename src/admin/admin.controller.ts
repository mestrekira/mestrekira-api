import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CleanupService } from '../cleanup/cleanup.service';
import { AdminKeyGuard } from './admin-key.guard';

@UseGuards(AdminKeyGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cleanup: CleanupService,
  ) {}

  // ✅ diagnóstico para painel (contadores e sinais vitais)
  @Get('diagnostics')
  async diagnostics() {
    const [
      users,
      rooms,
      tasks,
      essays,
      enrollments,
      scheduled,
      warned,
    ] = await Promise.all([
      this.count('user_entity'),
      this.count('room_entity'),
      this.count('task_entity'),
      this.count('essay_entity'),
      this.count('enrollment_entity'),
      this.countWhereNotNull('user_entity', 'scheduledDeletionAt'),
      this.countWhereNotNull('user_entity', 'inactivityWarnedAt'),
    ]);

    return {
      ok: true,
      counts: { users, rooms, tasks, essays, enrollments },
      cleanupFlags: {
        scheduledDeletionAt: scheduled,
        inactivityWarnedAt: warned,
      },
      nowISO: new Date().toISOString(),
    };
  }

  // ✅ lista candidatos (dia 83 e dia 90)
  @Get('cleanup/preview')
  async cleanupPreview(
    @Query('days') days?: string,
    @Query('warnDays') warnDays?: string,
  ) {
    return this.cleanup.previewInactiveCleanup(
      days ? Number(days) : 90,
      warnDays ? Number(warnDays) : 7,
    );
  }

  // ✅ envia avisos manualmente
  @Post('cleanup/send-warnings')
  async sendWarnings(
    @Body() body: { userIds: string[]; days?: number; warnDays?: number },
  ) {
    return this.cleanup.sendWarnings(
      body?.userIds || [],
      body?.days ?? 90,
      body?.warnDays ?? 7,
    );
  }

  // ✅ exclui manualmente
  @Post('cleanup/delete')
  async deleteUsers(@Body() body: { userIds: string[] }) {
    return this.cleanup.deleteUsers(body?.userIds || []);
  }

  private async count(table: string) {
    const r = await this.dataSource.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    return Number(r?.[0]?.n ?? 0);
  }

  private async countWhereNotNull(table: string, col: string) {
    const r = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE "${col}" IS NOT NULL`,
    );
    return Number(r?.[0]?.n ?? 0);
  }
}
