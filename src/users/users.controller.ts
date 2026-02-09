import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('professor')
  createProfessor(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    if (!name || !email || !password) {
      throw new BadRequestException('Preencha nome, e-mail e senha.');
    }
    return this.usersService.createProfessor(name, email, password);
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
    return this.usersService.createStudent(name, email, password);
  }

  // ✅ LOGIN por e-mail (bloqueia se não verificado)
  @Post('login')
  async login(@Body('email') email: string, @Body('password') password: string) {
    try {
      const user = await this.usersService.validateUser(email, password);

      if (!user) {
        return { ok: false, error: 'Usuário ou senha inválidos' };
      }

      if (!user.emailVerified) {
        return {
          ok: false,
          error: 'Confirme seu e-mail para acessar sua conta.',
          code: 'EMAIL_NOT_VERIFIED',
        };
      }

      return {
        ok: true,
        id: user.id,
        name: user.name,
        email: user.email,
        role: (user.role || '').toLowerCase(),
      };
    } catch (err) {
      console.error('LOGIN ERROR:', err);
      throw err;
    }
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { email?: string; password?: string },
  ) {
    return this.usersService.updateUser(id, body?.email?.trim(), body?.password);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.removeUser(id);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }
}
