import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from './user.entity';
import { EssayEntity } from '../essays/essay.entity';

function normalizeRole(role: any): 'professor' | 'student' {
  const r = String(role || '').toLowerCase();
  if (r === 'professor') return 'professor';
  if (r === 'student') return 'student';
  if (String(role).toUpperCase() === 'PROFESSOR') return 'professor';
  return 'student';
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(EssayEntity)
    private readonly essayRepo: Repository<EssayEntity>,

    private readonly dataSource: DataSource,
  ) {}

  async createProfessor(name: string, email: string, password: string) {
    email = String(email || '').trim().toLowerCase();

    if (!email.includes('@')) throw new BadRequestException('E-mail inválido.');
    if (!password || password.length < 8)
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new BadRequestException('Este e-mail já está cadastrado.');

    const user = this.userRepo.create({
      name,
      email,
      password,
      role: 'professor',
    });

    return this.userRepo.save(user);
  }

  async createStudent(name: string, email: string, password: string) {
    email = String(email || '').trim().toLowerCase();

    if (!email.includes('@')) throw new BadRequestException('E-mail inválido.');
    if (!password || password.length < 8)
      throw new BadRequestException('Senha deve ter no mínimo 8 caracteres.');

    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) throw new BadRequestException('Este e-mail já está cadastrado.');

    const user = this.userRepo.create({
      name,
      email,
      password,
      role: 'student',
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
      if (!newEmail.includes('@')) throw new BadRequestException('E-mail inválido.');

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

  /**
   * ✅ Exclusão "limpa" (prioridade armazenamento)
   * - Aluno: apaga redações do aluno e depois o usuário.
   * - Professor: vamos completar quando você colar Room/Task/memberships.
   */
  async removeUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const role = normalizeRole(user.role);

    await this.dataSource.transaction(async (manager) => {
      // 1) ALUNO: apaga redações do aluno
      if (role === 'student') {
        await manager
          .createQueryBuilder()
          .delete()
          .from(EssayEntity)
          .where('"studentId" = :id', { id })
          .execute();

        // TODO (quando você colar as tabelas):
        // - remover vínculo aluno-sala
        // - remover feedbacks/relatórios do aluno (se existirem)
      }

      // 2) PROFESSOR: vamos completar com Room/Task
      if (role === 'professor') {
        // TODO (quando você colar as tabelas):
        // - achar salas do professor
        // - apagar tarefas dessas salas
        // - apagar redações dessas tarefas
        // - apagar vínculos aluno-sala dessas salas
        // - apagar as salas
      }

      // 3) por fim apaga o usuário
      await manager
        .createQueryBuilder()
        .delete()
        .from(UserEntity)
        .where('id = :id', { id })
        .execute();
    });

    return { ok: true };
  }
}
