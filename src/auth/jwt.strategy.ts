import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

type JwtPayload = {
  sub: string;   // id do usuário
  role: string;  // student | professor | school
};

function normalizeRole(role: any): 'student' | 'professor' | 'school' {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'student' || r === 'aluno') return 'student';
  if (r === 'professor' || r === 'teacher') return 'professor';
  if (r === 'school' || r === 'escola') return 'school';
  // fallback seguro
  return 'student';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
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

    return {
      id: String(payload.sub),
      role: normalizeRole(payload.role),
    };
  }
}
