@Post('login')
async login(@Body('email') email: string, @Body('password') password: string) {
  const user = await this.usersService.validateUser(email, password);

  if (!user) {
    return { error: 'Usuário ou senha inválidos' };
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: (user.role || '').toLowerCase(), // ✅ padroniza
  };
}

@Get(':id')
async findOne(@Param('id') id: string) {
  const user = await this.usersService.findById(id);
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: (user.role || '').toLowerCase(), // ✅ padroniza
  };
}
