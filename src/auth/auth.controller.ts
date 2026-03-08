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
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * ✅ Login (serve para student/professor/school):
   * POST /auth/login
   */
  @Post('login')
  async login(
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.auth.login(email, password);
  }

  /**
   * ✅ Debug temporário para validar token JWT manualmente
   * POST /auth/debug-token
   * body: { token }
   */
  @Post('debug-token')
  async debugToken(@Body('token') token: string) {
    const raw = String(token || '').trim();
    if (!raw) {
      throw new BadRequestException('Token ausente.');
    }

    try {
      const decoded = await this.jwtService.verifyAsync(raw);
      return { ok: true, decoded };
    } catch (e: any) {
      return {
        ok: false,
        error: String(e?.message || 'Falha ao verificar token.'),
      };
    }
  }

  /**
   * ✅ Registro de escola:
   * POST /auth/register-school
   * body: { name, email, password }
   *
   * (compat opcional) aceita também schoolName
   */
  @Post('register-school')
  async registerSchool(
    @Body('name') name: string,
    @Body('schoolName') schoolName: string,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    const n = String(name || schoolName || '').trim();
    const e = String(email || '').trim().toLowerCase();
    const p = String(password || '');

    if (!n || !e || !p) {
      throw new BadRequestException('Preencha nome, e-mail e senha.');
    }
    if (!e.includes('@')) {
      throw new BadRequestException('E-mail inválido.');
    }
    if (p.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }

    return this.auth.registerSchool(n, e, p);
  }

  /**
   * ✅ Verificação de e-mail via link
   * GET /auth/verify-email?token=...
   *
   * - Navegador → redireciona para o frontend
   * - Postman/API → retorna JSON
   */
  @Get('verify-email')
  async verifyEmail(
    @Query('token') token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const web =
      (process.env.APP_WEB_URL || '').trim() ||
      'https://www.mestrekira.com.br/app/frontend';

    const accept = String(req.headers['accept'] || '');
    const wantsHtml = accept.includes('text/html');

    if (!wantsHtml) {
      return this.auth.verifyEmail(token);
    }

    try {
      await this.auth.verifyEmail(token);

      const redirectUrl = `${web}/verificar-email.html?ok=1`;
      res.redirect(302, redirectUrl);
      return;
    } catch (err: any) {
      const msg = String(
        err?.response?.message || err?.message || 'Erro ao verificar.',
      )
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
   * ✅ Primeiro acesso
   * POST /auth/first-password
   */
  @Post('first-password')
  @UseGuards(AuthGuard('jwt'))
  firstPassword(@Req() req: any, @Body('password') password: string) {
    const userId = String(req?.user?.id || '').trim();
    return this.auth.firstPassword(userId, password);
  }

  /**
   * ✅ Reenviar verificação
   */
  @Post('request-verify')
  async requestVerify(@Body('email') email: string) {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !e.includes('@')) {
      throw new BadRequestException('E-mail inválido.');
    }
    return this.auth.requestEmailVerification(e);
  }

  /**
   * ✅ Admin debug
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
   * ✅ Solicitar redefinição de senha
   */
  @Post('request-password-reset')
  async requestPasswordReset(
    @Body('email') email: string,
    @Body('role') role?: string,
  ) {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !e.includes('@')) {
      throw new BadRequestException('E-mail inválido.');
    }
    return this.auth.requestPasswordReset(e, role);
  }

  /**
   * ✅ Redefinir senha
   */
  @Post('reset-password')
  async resetPassword(
    @Body('token') token: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.auth.resetPassword(token, newPassword);
  }

  /**
   * ✅ Trocar senha
   * POST /auth/change-password
   * Authorization: Bearer <token>
   * body: { currentPassword, newPassword }
   */
  @UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  async changePassword(
    @Req() req: Request,
    @Body('currentPassword') currentPassword: string,
    @Body('newPassword') newPassword: string,
  ) {
    const uid = String((req as any)?.user?.id || '').trim();
    if (!uid) throw new UnauthorizedException('Sessão inválida.');
    return this.auth.changePassword(uid, currentPassword, newPassword);
  }
}
