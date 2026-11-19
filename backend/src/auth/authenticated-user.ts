import type { Request } from 'express';
import type { Role } from '../generated/prisma/enums.js';

/** Who is making the request, as proven by a valid access token. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}

/** A request after JwtAuthGuard: `user` is set on every protected route. */
export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };
