import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';
import { UserRole } from './user-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async createProfessor(name: string, email: string, password: string) {
    let user = await this.userRepo.findOne({ where: { email } });

    if (user) return user;

    user = this.userRepo.create({
      name,
      email,
      password,
      role: UserRole.PROFESSOR,
    });

    return this.userRepo.save(user);
  }

  async createStudent(name: string, email: string, password: string) {
    let user = await this.userRepo.findOne({ where: { email } });

    if (user) return user;

    user = this.userRepo.create({
      name,
      email,
      password,
      role: UserRole.STUDENT,
    });

    return this.userRepo.save(user);
  }

  async login(id: string, password: string) {
    return this.userRepo.findOne({
      where: { id, password },
    });
  }

  async findAll() {
    return this.userRepo.find();
  }
}
