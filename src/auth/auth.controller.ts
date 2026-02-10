import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * ✅ Login:
   * POST /auth/login
   * body: { "email": "...", "password": "..." }
   */
  @Post('login')
  async login(@Body('email') email: string, @Body('password') password: string) {
    return this.auth.login(email, password);
  }

  /**
   * ✅ Confirmação via link do e-mail (Plano A):
   * GET /auth/verify-email?token=...
   *
   * - Navegador: redireciona para /verificar-email.html?ok=1|0
   * - API/Postman: retorna JSON
   */
  @Get('verify-email')
  async verifyEmail(
    @Query('token') token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const web =
      (process.env.APP_WEB_URL || '').trim() || 'https://www.mestrekira.com.br';

    // heurística simples: se aceita HTML, é navegação
    const accept = String(req.headers['accept'] || '');
    const wantsHtml = accept.includes('text/html');

    // Se for API/JSON (Postman), mantém como antes
    if (!wantsHtml) {
      return this.auth.verifyEmail(token);
    }

    // Se for navegador, tenta verificar e redireciona
    try {
      await this.auth.verifyEmail(token);

      const redirectUrl = `${web}/verificar-email.html?ok=1`;
      res.redirect(302, redirectUrl);
      return;
    } catch (err: any) {
      // tenta extrair uma mensagem curta
      const msg =
        String(err?.response?.message || err?.message || 'Erro ao verificar.')
          .slice(0, 200)
          .trim();

      const redirectUrl = `${web}/verificar-email.html?ok=0&msg=${encodeURIComponent(
        msg,
      )}`;

      res.redirect(302, redirectUrl);
      return;
    }
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
