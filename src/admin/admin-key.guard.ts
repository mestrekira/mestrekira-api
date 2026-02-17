import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();

    const headerKey = String(req.headers['x-admin-key'] || '').trim();
    const envKey = String(process.env.ADMIN_KEY || '').trim();

    if (!envKey) {
      // Se não configurou ADMIN_KEY, é melhor bloquear do que expor.
      throw new UnauthorizedException('ADMIN_KEY não configurada no servidor.');
    }

    if (!headerKey || headerKey !== envKey) {
      throw new UnauthorizedException('Chave de administrador inválida.');
    }

    return true;
  }
}