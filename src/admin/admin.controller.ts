import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
  Post,
} from '@nestjs/common';

import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminJwtGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('me')
  me() {
    return this.admin.getMe();
  }

  @Patch('me')
  async updateMe(@Body() body: { email?: string; password?: string }) {
    const email = body?.email ? String(body.email).trim().toLowerCase() : undefined;
    const password = body?.password ? String(body.password) : undefined;

    if (!email && !password) {
      throw new BadRequestException('Nada para atualizar.');
    }

    return this.admin.updateMe({ email, password });
  }

 
  @Get('diagnostics')
  async diagnostics() {
    return this.admin.getDiagnostics();
  }

  @Post('cleanup/preview')
  async cleanupPreview(@Body() body: { days?: number; warnDays?: number }) {
    const days = Number(body?.days ?? 90);
    const warnDays = Number(body?.warnDays ?? 7);
    return this.admin.getCleanupPreview(days, warnDays);
  }

  
  @Post('cleanup/send-warnings')
  async sendWarnings(
    @Body() body: { userIds?: string[]; days?: number; warnDays?: number },
  ) {
    const userIds = Array.isArray(body?.userIds) ? body.userIds.map(String) : [];
    if (userIds.length === 0) {
      throw new BadRequestException('userIds é obrigatório.');
    }

    const days = Number(body?.days ?? 90);
    const warnDays = Number(body?.warnDays ?? 7);

    return this.admin.sendWarningsManual(userIds, days, warnDays);
  }

  @Post('cleanup/delete-users')
  async deleteUsers(@Body() body: { userIds?: string[] }) {
    const userIds = Array.isArray(body?.userIds) ? body.userIds.map(String) : [];
    if (userIds.length === 0) {
      throw new BadRequestException('userIds é obrigatório.');
    }

    return this.admin.deleteUsersManual(userIds);
  }
}
