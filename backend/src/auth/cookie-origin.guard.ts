import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env.validation.js';
import { isTrustedOrigin } from './trusted-origin.js';

/**
 * For the endpoints that act on the refresh cookie (refresh and logout): refuses a request
 * that a page on a site we do not know made the browser send. See `isTrustedOrigin`.
 */
@Injectable()
export class CookieOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const allowed = this.config.getOrThrow('CORS_ORIGINS', { infer: true });
    if (
      isTrustedOrigin(request.headers.origin, allowed, request.headers.host)
    ) {
      return true;
    }
    throw new ForbiddenException(
      'This request came from a site that is not allowed to use the sign-in cookie.',
    );
  }
}
