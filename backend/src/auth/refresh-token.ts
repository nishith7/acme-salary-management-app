import { createHash, randomBytes } from 'node:crypto';

/** Bytes of randomness in a refresh token: 32 bytes is 256 bits. */
const TOKEN_BYTES = 32;

/**
 * SHA-256 hex digest of a refresh token (64 characters). This is the only form
 * stored in the database.
 *
 * A fast hash is right here because the token is random and 256 bits long, so
 * there is nothing to brute-force. A password would need a slow hash instead.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a new refresh token. `token` goes to the client once and is never
 * stored; `hash` is what gets saved and looked up.
 */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

/**
 * When a token issued at `issuedAt` stops being valid. The time is passed in,
 * so callers (and tests) control the clock.
 */
export function refreshTokenExpiry(issuedAt: Date, lifetimeMs: number): Date {
  return new Date(issuedAt.getTime() + lifetimeMs);
}
