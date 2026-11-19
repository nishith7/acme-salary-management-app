import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route (or a whole controller) out of the global JwtAuthGuard. Every
 * route is protected unless it says otherwise, so forgetting this decorator
 * fails closed: the route needs a token.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
