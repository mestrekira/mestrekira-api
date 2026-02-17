import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly admin: AdminService) {}

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !email.includes('@') || !password) {
      throw new BadRequestException('Informe e-mail e senha.');
    }

    return this.admin.login(email, password);
  }
}
