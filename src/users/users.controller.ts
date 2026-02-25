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
  // Helpers
  // ----------------------------------------------------
  private norm(v: any) {
    const s = String(v ?? '').trim();
    return s && s !== 'undefined' && s !== 'null' ? s : '';
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

  // ----------------------------------------------------
  // CADASTRO (mantido por compatibilidade com seu front)
  // Recomendo migrar para AuthController (/auth/register-*)
  // ----------------------------------------------------
  @Post('professor')
  createProfessor(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    if (!name || !email || !password) {
      throw new BadRequestException('Preencha nome, e-mail e senha.');
    }
    return this.auth.registerProfessor(name, email, password);
  }

  @Post('student')
  createStudent(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    if (!name || !email || !password) {
      throw new BadRequestException('Preencha nome, e-mail e senha.');
    }
    return this.auth.registerStudent(name, email, password);
  }

  // ✅ (opcional) se você já tem /auth/register-school, este endpoint pode ser removido
  @Post('school')
  createSchool(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    if (!name || !email || !password) {
      throw new BadRequestException('Preencha nome, e-mail e senha.');
    }
    // precisa existir no AuthService: registerSchool(name,email,password)
    return this.auth.registerSchool(name, email, password);
  }

  // ----------------------------------------------------
  // LOGIN (mantido por compatibilidade)
  // Recomendo usar /auth/login e remover este depois
  // ----------------------------------------------------
  @Post('login')
  async login(@Body('email') email: string, @Body('password') password: string) {
    return this.auth.login(email, password);
  }

  // ----------------------------------------------------
  // ✅ NOVO PADRÃO SEGURO: /users/me
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

    return this.usersService.updateUser(id, body?.email?.trim(), body?.password);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  removeMe(@Req() req: Request) {
    const { id } = this.getTokenUser(req);
    if (!id) throw new ForbiddenException('Token inválido.');

    return this.usersService.removeUser(id);
  }

  /**
   * ✅ Opcional (recomendado): confirmar exclusão com senha
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
  // ROTAS LEGADAS COM :id (agora protegidas)
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

    return this.usersService.updateUser(uid, body?.email?.trim(), body?.password);
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
   * ⚠️ ADMIN ONLY (se você ainda não tem admin, é melhor remover)
   * Por enquanto, vou PROTEGER e bloquear geral:
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Req() req: Request) {
    // Sem um role/admin guard, isso é perigoso.
    // Melhor bloquear por padrão.
    const { role } = this.getTokenUser(req);
    throw new ForbiddenException(
      `Rota /users (listar todos) desativada por segurança. Role atual: ${role || 'unknown'}.`,
    );
  }
}
