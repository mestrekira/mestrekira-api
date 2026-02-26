import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Bloqueia professor gerenciado por escola enquanto mustChangePassword=true.
 * - Deixa passar: student, school, professor individual
 * - Bloqueia: professor com mustChangePassword=true
 */
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user: any = (req as any).user || {};

    const role = String(user.role || '').toLowerCase();
    const must = !!user.mustChangePassword;

    if (role === 'professor' && must) {
      throw new ForbiddenException(
        'Você precisa trocar sua senha no primeiro acesso antes de continuar.',
      );
    }

    return true;
  }
}

