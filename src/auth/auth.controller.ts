import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * ✅ Confirmação via link do e-mail:
   * GET /auth/verify-email?token=...
   */
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    return this.auth.verifyEmail(token);
  }

  /**
   * ✅ Reenvio (público):
   * POST /auth/request-verify
   * body: { "email": "..." }
   */
  @Post('request-verify')
  async requestVerify(@Body('email') email: string) {
    return this.auth.requestEmailVerification(email);
  }

  /**
   * ✅ (Opcional) Admin debug para testes no Postman:
   * POST /auth/admin/send-verify
   * Header: x-auth-secret: <AUTH_ADMIN_SECRET>
   * Body: { "userId": "uuid" }
   *
   * Defina AUTH_ADMIN_SECRET no Render.
   */
  @Post('admin/send-verify')
  async adminSendVerify(
    @Headers('x-auth-secret') secret: string,
    @Body('userId') userId: string,
  ) {
    const expected = (process.env.AUTH_ADMIN_SECRET || '').trim();
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('unauthorized');
    }

    return this.auth.adminSendVerifyByUserId(userId);

  }

    /**
   * ✅ Esqueci minha senha:
   * POST /auth/request-password-reset
   * body: { "email": "..." }
   */
  @Post('request-password-reset')
  async requestPasswordReset(@Body('email') email: string) {
    return this.auth.requestPasswordReset(email);
  }

  /**
   * ✅ Redefinir senha:
   * POST /auth/reset-password
   * body: { "token": "...", "newPassword": "..." }
   */
  @Post('reset-password')
  async resetPassword(
    @Body('token') token: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.auth.resetPassword(token, newPassword);
  }
}
