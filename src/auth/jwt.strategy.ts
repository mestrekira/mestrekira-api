import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../users/user.entity';

type JwtPayload = {
  sub: string;
  role: string;
  mustChangePassword?: boolean;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        (process.env.JWT_SECRET || '').trim() ||
        'DEV_ONLY_CHANGE_ME__MESTRE_KIRA',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException('Token inválido.');
    }

    const id = String(payload.sub);
    const role = String(payload.role || '').toLowerCase();

    const user = await this.userRepo.findOne({ where: { id } });

    return {
      id,
      role,
      mustChangePassword: !!user?.mustChangePassword,
      professorType: user?.professorType ?? null,
      schoolId: user?.schoolId ?? null,
    };
  }
}
