import { Controller, Get, Post, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { Patch, Delete, Param } from '@nestjs/common';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('professor')
  createProfessor(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.usersService.createProfessor(name, email, password);
  }

  @Post('student')
  createStudent(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.usersService.createStudent(name, email, password);
  }
  
@Post('login')
async login(@Body('email') email: string, @Body('password') password: string) {
  const user = await this.usersService.validateUser(email, password);

  if (!user) {
    return { error: 'Usuário ou senha inválidos' };
  }

  return {
    id: user.id,
    name: user.name,
    role: user.role,
  };
}

@Patch(':id')
update(
  @Param('id') id: string,
  @Body() body: { email?: string; password?: string },
) {
  return this.usersService.updateUser(id, body.email, body.password);
}

@Delete(':id')
remove(@Param('id') id: string) {
  return this.usersService.removeUser(id);
}

@Get(':id')
findOne(@Param('id') id: string) {
  return this.usersService.findById(id);
}
  
  @Get()
  findAll() {
    return this.usersService.findAll();
  }
}

