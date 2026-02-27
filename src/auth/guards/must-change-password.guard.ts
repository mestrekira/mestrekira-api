import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user: any = (req as any).user || {};

    const role = String(user.role || '').toLowerCase();
    const must = !!user.mustChangePassword;

    // Só se aplica ao professor
    if (role !== 'professor') return true;

    // Professor ok
    if (!must) return true;

    // ---------------------------------------------------
    // ✅ Allowlist: rotas mínimas para destravar a conta
    // ---------------------------------------------------
    const method = String(req.method || '').toUpperCase();
    const path = String((req as any).route?.path || req.path || '').toLowerCase();

    // Permite consultar o próprio perfil (opcional, mas útil)
    if (method === 'GET' && (path === '/users/me' || path.endsWith('/users/me'))) {
      return true;
    }

    // Permite trocar senha pelo endpoint seguro /users/me
    if (method === 'PATCH' && (path === '/users/me' || path.endsWith('/users/me'))) {
      return true;
    }

    // Compat: permite PATCH /users/:id (somente para atualizar a própria senha no fluxo antigo)
    // Observação: o UsersController já impede alterar outro id.
    if (method === 'PATCH' && (path === '/users/:id' || path.includes('/users/') )) {
      // Aqui é broad, mas o controller faz a trava de "self".
      // Se quiser mais rígido, posso bater regex no req.originalUrl.
      return true;
    }

    // Bloqueia o restante
    throw new ForbiddenException(
      'Você precisa trocar sua senha no primeiro acesso antes de continuar.',
    );
  }
}
