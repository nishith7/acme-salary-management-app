/** How long an access token is valid. Short, because it cannot be revoked. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** How long a refresh token is valid (sliding: each rotation issues a fresh 7 days). */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** One message for every login failure, so a response never says which part was wrong. */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
