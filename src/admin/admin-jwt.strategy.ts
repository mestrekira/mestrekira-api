import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

type AdminPayload = { sub: 'admin'; email: string };

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: String(process.env.ADMIN_JWT_SECRET || '').trim(),
    });
  }

  async validate(payload: AdminPayload) {
    if (!payload || payload.sub !== 'admin') {
      throw new UnauthorizedException('Token admin inválido.');
    }

    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const recoveryEmail = String(process.env.ADMIN_RECOVERY_EMAIL || '').trim().toLowerCase();

    const incoming = String(payload.email || '').trim().toLowerCase();

    const allowed = incoming === adminEmail || (!!recoveryEmail && incoming === recoveryEmail);
    if (!allowed) throw new UnauthorizedException('Admin não autorizado.');

    return { sub: 'admin', email: incoming, role: 'admin' };
  }
}
