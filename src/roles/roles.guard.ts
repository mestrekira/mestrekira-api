import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      Array<'student' | 'professor' | 'school'>
    >(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);

    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const role = String(req?.user?.role || '').toLowerCase();

    return required.includes(role as any);
  }
}
