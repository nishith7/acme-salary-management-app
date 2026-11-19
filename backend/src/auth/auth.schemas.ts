import { z } from 'zod';
import { Role } from '../generated/prisma/enums.js';

/**
 * Request and response shapes for the auth endpoints. Each schema is the one
 * source for validation, TypeScript types and the Swagger document.
 */

export const loginSchema = z.object({
  email: z
    .email()
    .transform((email) => email.toLowerCase())
    .describe('The HR manager’s email address. Matched case-insensitively.'),
  password: z
    .string()
    .min(1)
    .max(128)
    .describe('The account password. At most 128 characters.'),
});
export type LoginRequest = z.infer<typeof loginSchema>;

export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: z.enum(Role),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({
  accessToken: z
    .string()
    .describe('JWT to send as `Authorization: Bearer <token>`.'),
  expiresIn: z
    .number()
    .int()
    .describe('Seconds until the access token expires.'),
  user: authUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
