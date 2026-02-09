import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Link do e-mail: /auth/verify-email?token=...
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    // depois, se quiser, podemos retornar HTML bonitinho ou redirecionar.
    return this.auth.verifyEmail(token);
  }

  // Reenvio: POST /auth/resend-verification { "email": "..." }
  @Post('resend-verification')
  async resend(@Body('email') email: string) {
    return this.auth.resendVerification(email);
  }
}
