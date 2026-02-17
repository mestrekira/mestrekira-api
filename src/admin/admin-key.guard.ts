import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

function normEmail(v: any) {
  return String(v || '').trim().toLowerCase();
}

@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();

    const headerKey = String(req.headers['x-admin-key'] || '').trim();
    const envKey = String(process.env.ADMIN_KEY || '').trim();

    if (!envKey) {
      throw new UnauthorizedException('ADMIN_KEY não configurada no servidor.');
    }
    if (!headerKey || headerKey !== envKey) {
      throw new UnauthorizedException('Chave de administrador inválida.');
    }

    // ✅ “apenas 1 administrador” por e-mail
    const headerEmail = normEmail(req.headers['x-admin-email']);
    const adminEmail = normEmail(process.env.ADMIN_EMAIL);
    const recoveryEmail = normEmail(process.env.ADMIN_RECOVERY_EMAIL);

    if (!adminEmail) {
      throw new UnauthorizedException('ADMIN_EMAIL não configurado no servidor.');
    }

    const ok =
      headerEmail &&
      (headerEmail === adminEmail ||
        (!!recoveryEmail && headerEmail === recoveryEmail));

    if (!ok) {
      throw new UnauthorizedException('E-mail de administrador não autorizado.');
    }

    return true;
  }
}
