import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../generated/prisma/enums.js';
import type { AuthenticatedRequest } from './authenticated-user.js';
import { ROLES_KEY } from './roles.decorator.js';

/**
 * Registered for the whole app, after JwtAuthGuard. A route without @Roles
 * is open to any signed-in user; with @Roles the user must have one of the
 * listed roles. It fails closed: if a role is required and no user is on the
 * request, that is a 403 rather than a pass.
 *
 * The role comes from the access token, so a role change takes effect when
 * the token is next refreshed (at most 15 minutes).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to do this');
    }
    return true;
  }
}
