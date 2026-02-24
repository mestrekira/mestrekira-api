import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, AppRole } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    // se não tem roles exigidas, libera
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const role = String(req?.user?.role || '').trim().toLowerCase() as AppRole;

    return required.includes(role);
  }
}