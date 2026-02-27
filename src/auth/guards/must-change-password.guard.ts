import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  private norm(v: any) {
    const s = String(v ?? '').trim();
    return s && s !== 'undefined' && s !== 'null' ? s : '';
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user: any = (req as any).user || {};

    const role = String(user.role || '').toLowerCase();
    const must = !!user.mustChangePassword;

    // Só aplica ao professor
    if (role !== 'professor') return true;

    // Professor ok
    if (!must) return true;

    // Token id (o JwtStrategy retorna { id, role })
    const tokenId = this.norm(user.id || user.userId || user.sub);
    if (!tokenId) {
      throw new ForbiddenException('Token inválido.');
    }

    const method = String(req.method || '').toUpperCase();
    const path = String((req as any).route?.path || '').toLowerCase();

    // ✅ Permite ler o próprio perfil (opcional)
    if (method === 'GET' && path === 'me') return true; // quando controller é /users + route 'me'
    if (method === 'GET' && path === '/me') return true;

    // ✅ Permite trocar pelo /users/me
    if (method === 'PATCH' && (path === 'me' || path === '/me')) return true;

    // ✅ Permite trocar pelo /users/:id, MAS apenas se o :id == tokenId
    if (method === 'PATCH' && (path === ':id' || path === '/:id')) {
      const paramId = this.norm((req as any).params?.id);
      if (paramId && paramId === tokenId) return true;

      throw new ForbiddenException('Você só pode alterar a sua própria conta.');
    }

    // ❌ Bloqueia todo o resto enquanto mustChangePassword=true
    throw new ForbiddenException(
      'Você precisa trocar sua senha no primeiro acesso antes de continuar.',
    );
  }
}
