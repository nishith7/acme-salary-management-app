import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { accessTokenPayloadSchema } from './access-token.js';
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_INVALID_MESSAGE,
} from './auth.constants.js';
import type { AuthenticatedRequest } from './authenticated-user.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Registered for the whole app: every route needs a valid access token unless
 * it is marked @Public(). The token is checked from its signature alone, with
 * no database call, which is the point of a short-lived JWT. On success the
 * user's id and role are put on `request.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException(ACCESS_TOKEN_INVALID_MESSAGE);
    }

    let payload: unknown;
    try {
      // Pinning the algorithm refuses `none` and any other algorithm.
      payload = await this.jwt.verifyAsync(token, {
        algorithms: [ACCESS_TOKEN_ALGORITHM],
      });
    } catch {
      // Bad signature, expired, malformed: the caller gets the same answer.
      throw new UnauthorizedException(ACCESS_TOKEN_INVALID_MESSAGE);
    }

    const claims = accessTokenPayloadSchema.safeParse(payload);
    if (!claims.success) {
      throw new UnauthorizedException(ACCESS_TOKEN_INVALID_MESSAGE);
    }

    request.user = { id: claims.data.sub, role: claims.data.role };
    return true;
  }
}

/** The token from `Authorization: Bearer <token>`. The scheme is case-insensitive. */
function bearerToken(header: string | undefined): string | undefined {
  return /^Bearer (\S+)$/i.exec(header ?? '')?.[1];
}
