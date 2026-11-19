import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ACCESS_TOKEN_INVALID_MESSAGE } from './auth.constants.js';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from './authenticated-user.js';

/**
 * The signed-in user, from the access token. Only meaningful on a protected
 * route; on a public route there is no user, and asking for one is refused.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      throw new UnauthorizedException(ACCESS_TOKEN_INVALID_MESSAGE);
    }
    return user;
  },
);
