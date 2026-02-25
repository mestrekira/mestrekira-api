import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();

    const role = String(req?.user?.role || '').toLowerCase();
    if (role !== 'professor') return true;

    const must = !!req?.user?.mustChangePassword;
    if (!must) return true;

    const path = String(req?.route?.path || req?.path || '');
    const allow = ['/auth/first-password'];

    if (allow.some((p) => path.includes(p))) return true;

    throw new ForbiddenException(
      'Você precisa definir sua nova senha para continuar.',
    );
  }
}