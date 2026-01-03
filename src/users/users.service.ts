import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async createProfessor(name: string, email: string, password: string) {
    const user = this.userRepo.create({
      name,
      email,
      password,
      role: 'PROFESSOR',
    });

    return this.userRepo.save(user);
  }

  async createStudent(name: string, email: string, password: string) {
    const user = this.userRepo.create({
      name,
      email,
      password,
      role: 'STUDENT',
    });

    return this.userRepo.save(user);
  }

  async findByEmail(email: string) {
    return this.userRepo.findOne({ where: { email } });
  }

  async findAll() {
    return this.userRepo.find();
  }

  async validateUser(email: string, password: string) {
    const user = await this.findByEmail(email);

    if (!user) return null;
    if (user.password !== password) return null;

    return user;
  }
}
