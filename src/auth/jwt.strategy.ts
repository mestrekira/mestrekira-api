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
    if (!payload?.sub) throw new UnauthorizedException('Token inválido.');

    return {
      id: String(payload.sub),
      role: String(payload.role || ''),
      mustChangePassword: !!payload.mustChangePassword,
    };
  }
}
