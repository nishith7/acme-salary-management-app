export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  /**
   * How many proxies sit between the internet and this app, so the app knows
   * which entry of X-Forwarded-For is the real client. 0 means none: the
   * header is ignored. Too low makes everyone look like one client; too high
   * lets a client forge its address. See docs/architecture.md section 5.
   */
  TRUST_PROXY: number;
  /** Login requests one client address may make per window. */
  LOGIN_RATE_LIMIT: number;
  LOGIN_RATE_WINDOW_SECONDS: number;
  /**
   * The sites whose pages may call this API from a browser, each as an origin
   * (scheme and host, plus a port if it is not the default), for example
   * http://localhost:5173. Empty by default: no page on another site can read
   * a response. A list and never a wildcard, because the refresh token is a
   * cookie and browsers refuse a wildcard when cookies are involved.
   */
  CORS_ORIGINS: string[];
  /**
   * Whether the browser may send the refresh cookie on a request that comes from another
   * site. `strict` (the default) never does, which is right when the site and the API share
   * a site. When they do not (the site on github.io, the API on onrender.com), `strict` means
   * the cookie is never sent, so every reload and every expiry of the 15-minute access token
   * signs the user out; `none` fixes that. `none` works in Chrome, Edge and Firefox and not in
   * Safari, which blocks third-party cookies. It also removes the cookie's own protection
   * against other sites making the browser call the cookie endpoints, so those endpoints
   * check the request's Origin against CORS_ORIGINS instead.
   */
  REFRESH_COOKIE_SAMESITE: 'strict' | 'lax' | 'none';
}

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

/** HS256 is only as strong as its key, so refuse short secrets at startup. */
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Validates the environment at startup so a misconfigured deploy fails fast
 * with a clear message. Error messages never include the value itself, because
 * a connection string or a signing secret is a credential.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const databaseUrl = config['DATABASE_URL'];
  const jwtSecret = config['JWT_SECRET'];

  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('Invalid environment: DATABASE_URL is required');
  }

  if (!isPostgresUrl(databaseUrl)) {
    throw new Error(
      'Invalid environment: DATABASE_URL must be a postgres:// or postgresql:// URL',
    );
  }

  if (typeof jwtSecret !== 'string' || jwtSecret.trim() === '') {
    throw new Error('Invalid environment: JWT_SECRET is required');
  }

  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `Invalid environment: JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`,
    );
  }

  return {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    // The upper bound on TRUST_PROXY is a sanity check: a large value would
    // let a client forge its address with a long X-Forwarded-For.
    TRUST_PROXY: readInteger(config, 'TRUST_PROXY', {
      fallback: 0,
      min: 0,
      max: 10,
    }),
    LOGIN_RATE_LIMIT: readInteger(config, 'LOGIN_RATE_LIMIT', {
      fallback: 5,
      min: 1,
      max: 10_000,
    }),
    LOGIN_RATE_WINDOW_SECONDS: readInteger(
      config,
      'LOGIN_RATE_WINDOW_SECONDS',
      {
        fallback: 60,
        min: 1,
        max: 86_400,
      },
    ),
    CORS_ORIGINS: readOrigins(config, 'CORS_ORIGINS'),
    REFRESH_COOKIE_SAMESITE: readSameSite(config, 'REFRESH_COOKIE_SAMESITE'),
  };
}

/** `strict`, `lax` or `none`, in any case. Missing or blank is `strict`. The message never echoes the value. */
function readSameSite(
  config: Record<string, unknown>,
  name: string,
): Env['REFRESH_COOKIE_SAMESITE'] {
  const raw = config[name];
  if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return 'strict';
  }
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'strict' || value === 'lax' || value === 'none') {
    return value;
  }
  throw new Error(`Invalid environment: ${name} must be strict, lax or none`);
}

/**
 * Reads a comma-separated list of origins. A missing or blank value is an
 * empty list. Each entry must be exactly an origin: "http://localhost:5173",
 * not "http://localhost:5173/" or "localhost:5173" or "*". The message names
 * the variable and never echoes what was set.
 */
function readOrigins(config: Record<string, unknown>, name: string): string[] {
  const raw = config[name];
  if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return [];
  }

  const origins =
    typeof raw === 'string'
      ? raw
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry !== '')
      : [];

  if (typeof raw !== 'string' || !origins.every(isBareOrigin)) {
    throw new Error(
      `Invalid environment: ${name} must be a comma-separated list of origins such as https://app.example.com (scheme and host, with no path and no trailing slash)`,
    );
  }
  return origins;
}

function isBareOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

/**
 * Reads a whole number from the environment, where values arrive as strings.
 * A missing or blank value (an empty line in .env) falls back to the default.
 * Anything else that is not a whole number within range is an error, and the
 * message names the variable but never echoes what was set.
 */
function readInteger(
  config: Record<string, unknown>,
  name: string,
  range: { fallback: number; min: number; max: number },
): number {
  const raw = config[name];
  if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return range.fallback;
  }

  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw.trim())
        ? Number(raw.trim())
        : Number.NaN;

  if (!Number.isInteger(value) || value < range.min || value > range.max) {
    throw new Error(
      `Invalid environment: ${name} must be a whole number from ${range.min} to ${range.max}`,
    );
  }
  return value;
}

function isPostgresUrl(value: string): boolean {
  try {
    return POSTGRES_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}
