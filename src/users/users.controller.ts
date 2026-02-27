import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  BadRequestException,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';

import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auth: AuthService,
  ) {}

  // ----------------------------------------------------
  // Helpers (anti "undefined"/"null" e trims)
  // ----------------------------------------------------
  private norm(v: any) {
    const s = String(v ?? '').trim();
    return s && s !== 'undefined' && s !== 'null' ? s : '';
  }

  private normEmail(v: any) {
    return this.norm(v).toLowerCase();
  }

  private getTokenUser(req: Request) {
    const u: any = (req as any).user || {};
    const id = this.norm(u.id || u.userId || u.sub);
    const role = String(u.role || '').trim().toLowerCase();
    return { id, role };
  }

  private assertSelfOrThrow(req: Request, targetUserId: string) {
    const { id: tokenId } = this.getTokenUser(req);
    if (!tokenId) throw new ForbiddenException('Token inválido.');
    if (tokenId !== targetUserId) {
      throw new ForbiddenException('Você não tem permissão para acessar este usuário.');
    }
  }

  private assertEmailPassword(name: any, email: any, password: any) {
    const n = this.norm(name);
    const e = this.normEmail(email);
    const p = String(password ?? '');

    if (!n || !e || !p) {
      throw new BadRequestException('Preencha nome, e-mail e senha.');
    }
    if (!e.includes('@')) {
      throw new BadRequestException('E-mail inválido.');
    }
    if (p.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }
    return { n, e, p };
  }

  // ----------------------------------------------------
  // CADASTRO (compatibilidade)
  // Recomendado no futuro: mover tudo para AuthController (/auth/register-*)
  // ----------------------------------------------------
  @Post('professor')
  createProfessor(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    const { n, e, p } = this.assertEmailPassword(name, email, password);
    return this.auth.registerProfessor(n, e, p);
  }

  @Post('student')
  createStudent(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    const { n, e, p } = this.assertEmailPassword(name, email, password);
    return this.auth.registerStudent(n, e, p);
  }

  /**
   * ✅ (opcional) Cadastro de escola por /users/school
   * Se você já usa /auth/register-school, pode remover este endpoint no futuro.
   */
  @Post('school')
  createSchool(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    const { n, e, p } = this.assertEmailPassword(name, email, password);
    return this.auth.registerSchool(n, e, p);
  }

  // ----------------------------------------------------
  // LOGIN (compatibilidade)
  // Ideal: usar /auth/login e remover este endpoint depois
  // ----------------------------------------------------
  @Post('login')
  async login(@Body('email') email: string, @Body('password') password: string) {
    const e = this.normEmail(email);
    const p = String(password ?? '');
    if (!e || !p) throw new BadRequestException('Preencha e-mail e senha.');
    return this.auth.login(e, p);
  }

  // ----------------------------------------------------
  // ✅ PADRÃO SEGURO: /users/me
  // ----------------------------------------------------
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    const { id } = this.getTokenUser(req);
    if (!id) throw new ForbiddenException('Token inválido.');
    return this.usersService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(
    @Req() req: Request,
    @Body() body: { email?: string; password?: string },
  ) {
    const { id } = this.getTokenUser(req);
    if (!id) throw new ForbiddenException('Token inválido.');

    const email = body?.email != null ? this.normEmail(body.email) : undefined;
    const password = body?.password != null ? String(body.password) : undefined;

    // evita update “vazio”
    if (!email && !password) {
      throw new BadRequestException('Informe email e/ou password para atualizar.');
    }

    return this.usersService.updateUser(id, email, password);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  removeMe(@Req() req: Request) {
    const { id } = this.getTokenUser(req);
    if (!id) throw new ForbiddenException('Token inválido.');
    return this.usersService.removeUser(id);
  }

  /**
   * ✅ Confirmar exclusão com senha
   * DELETE /users/me/confirm  body: { password }
   */
  @UseGuards(JwtAuthGuard)
  @Delete('me/confirm')
  removeMeWithPassword(@Req() req: Request, @Body('password') password: string) {
    const { id } = this.getTokenUser(req);
    if (!id) throw new ForbiddenException('Token inválido.');

    const p = this.norm(password);
    if (!p) throw new BadRequestException('Senha é obrigatória para confirmar.');

    return this.usersService.removeUserWithPassword(id, p);
  }

  // ----------------------------------------------------
  // ROTAS LEGADAS COM :id (AGORA PROTEGIDAS)
  // - somente o próprio pode acessar
  // ----------------------------------------------------
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const uid = this.norm(id);
    if (!uid) throw new BadRequestException('id é obrigatório.');
    this.assertSelfOrThrow(req, uid);
    return this.usersService.findById(uid);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { email?: string; password?: string },
  ) {
    const uid = this.norm(id);
    if (!uid) throw new BadRequestException('id é obrigatório.');
    this.assertSelfOrThrow(req, uid);

    const email = body?.email != null ? this.normEmail(body.email) : undefined;
    const password = body?.password != null ? String(body.password) : undefined;

    if (!email && !password) {
      throw new BadRequestException('Informe email e/ou password para atualizar.');
    }

    return this.usersService.updateUser(uid, email, password);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const uid = this.norm(id);
    if (!uid) throw new BadRequestException('id é obrigatório.');
    this.assertSelfOrThrow(req, uid);
    return this.usersService.removeUser(uid);
  }

  /**
   * ⚠️ ADMIN ONLY
   * Por segurança, bloquear por padrão.
   * Depois a gente cria um AdminGuard (x-auth-secret ou role admin).
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Req() req: Request) {
    const { role } = this.getTokenUser(req);
    throw new ForbiddenException(
      `Rota /users (listar todos) desativada por segurança. Role atual: ${role || 'unknown'}.`,
    );
  }
}
