import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

type JwtPayload = {
  sub?: string; // padrão comum
  id?: string;  // alguns sistemas usam isso
  role?: string;
  email?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev_secret_change_me',
    });
  }

  async validate(payload: JwtPayload) {
    const id = payload?.sub || payload?.id;
    if (!id) throw new UnauthorizedException('Token inválido.');
    return {
      id: String(id),
      role: payload?.role,
      email: payload?.email,
    };
  }
}
