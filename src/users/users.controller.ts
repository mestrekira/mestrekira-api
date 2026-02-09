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
import { AuthService } from '../auth/auth.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auth: AuthService,
  ) {}

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

  // ✅ LOGIN agora bloqueia se não verificado
  @Post('login')
  async login(@Body('email') email: string, @Body('password') password: string) {
    return this.auth.login(email, password);
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
    return this.usersService.updateUser(
      id,
      body?.email?.trim(),
      body?.password,
    );
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
