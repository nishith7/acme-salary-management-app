/** How long an access token is valid. Short, because it cannot be revoked. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * The only algorithm an access token is signed or accepted with. Verification
 * pins it, so a token claiming `none` or another algorithm is refused.
 */
export const ACCESS_TOKEN_ALGORITHM = 'HS256';

/** One message for every refused access token, whatever was wrong with it. */
export const ACCESS_TOKEN_INVALID_MESSAGE = 'Invalid or missing access token';

/** How long a refresh token is valid (sliding: each rotation issues a fresh 7 days). */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** One message for every login failure, so a response never says which part was wrong. */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

/**
 * One message for every refresh failure (no cookie, unknown, expired, replayed),
 * so a response never tells an attacker why a token was refused.
 */
export const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please log in again.';
