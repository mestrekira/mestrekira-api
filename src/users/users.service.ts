import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';

function normalizeRole(role: any): 'professor' | 'student' {
  // garante compatibilidade com o seu front (minúsculo)
  const r = String(role || '').toLowerCase();
  if (r === 'professor') return 'professor';
  if (r === 'student') return 'student';
  if (r === 'professor'.toUpperCase().toLowerCase()) return 'professor';
  if (r === 'student'.toUpperCase().toLowerCase()) return 'student';

  // fallback (se vier PROfessor/PROFESSOR/STUDENT)
  if (String(role).toUpperCase() === 'PROFESSOR') return 'professor';
  return 'student';
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async createProfessor(name: string, email: string, password: string) {
    email = String(email || '').trim().toLowerCase();

    if (!email.includes('@')) {
      throw new BadRequestException('E-mail inválido.');
    }
    if (!password || password.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) {
      throw new BadRequestException('Este e-mail já está cadastrado.');
    }

    const user = this.userRepo.create({
      name,
      email,
      password,
      role: 'professor', // ✅ padronizado
    });

    return this.userRepo.save(user);
  }

  async createStudent(name: string, email: string, password: string) {
    email = String(email || '').trim().toLowerCase();

    if (!email.includes('@')) {
      throw new BadRequestException('E-mail inválido.');
    }
    if (!password || password.length < 8) {
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
    }

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) {
      throw new BadRequestException('Este e-mail já está cadastrado.');
    }

    const user = this.userRepo.create({
      name,
      email,
      password,
      role: 'student', // ✅ padronizado
    });

    return this.userRepo.save(user);
  }

  async findByEmail(email: string) {
    email = String(email || '').trim().toLowerCase();
    return this.userRepo.findOne({ where: { email } });
  }

  async findAll() {
    return this.userRepo.find();
  }

  async validateUser(email: string, password: string) {
    const user = await this.findByEmail(email);

    if (!user) return null;
    if (user.password !== password) return null;

    // ✅ garante role no formato que o front espera
    user.role = normalizeRole(user.role);
    return user;
  }

  async findById(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role),
    };
  }

  async updateUser(id: string, email?: string, password?: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (email) {
      const newEmail = String(email).trim().toLowerCase();
      if (!newEmail.includes('@')) {
        throw new BadRequestException('E-mail inválido.');
      }

      // impede duplicar e-mail
      const exists = await this.userRepo.findOne({ where: { email: newEmail } });
      if (exists && exists.id !== id) {
        throw new BadRequestException('Este e-mail já está em uso.');
      }

      user.email = newEmail;
    }

    if (password) {
      if (password.length < 8) {
        throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');
      }
      user.password = password;
    }

    await this.userRepo.save(user);
    return { ok: true };
  }

  async removeUser(id: string) {
    const exists = await this.userRepo.findOne({ where: { id } });
    if (!exists) throw new NotFoundException('Usuário não encontrado');

    await this.userRepo.delete(id);
    return { ok: true };
  }
}
