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

  // ✅ LOGIN por e-mail (padrão aluno e professor)
@Post('login')
async login(@Body('email') email: string, @Body('password') password: string) {
  try {
    const user = await this.usersService.validateUser(email, password);

    if (!user) {
      return { error: 'Usuário ou senha inválidos' };
    }

    // ✅ BLOQUEIA até verificar e-mail
    if (!user.emailVerified) {
      return {
        error: 'Confirme seu e-mail para acessar.',
        code: 'EMAIL_NOT_VERIFIED',
      };
    }

    return {
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


  // ✅ usado pelo menu-perfil.js (GET /users/:id)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  // ✅ usado pelo menu-perfil.js (PATCH /users/:id)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { email?: string; password?: string },
  ) {
    return this.usersService.updateUser(
      id,
      body?.email?.trim(),
      body?.password,
    );
  }

  // ✅ usado pelo menu-perfil.js (DELETE /users/:id)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.removeUser(id);
  }

  // (se você usa esse endpoint pra debug, ok manter)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }
}


