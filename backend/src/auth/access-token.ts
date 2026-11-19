import { z } from 'zod';
import { Role } from '../generated/prisma/enums.js';

/**
 * What an access token must contain to be accepted, checked after its signature.
 * A token that is validly signed but has the wrong shape is still refused, and
 * `exp` is required so a token that never expires cannot be used.
 */
export const accessTokenPayloadSchema = z.object({
  sub: z.uuid(),
  role: z.enum(Role),
  exp: z.number(),
});
