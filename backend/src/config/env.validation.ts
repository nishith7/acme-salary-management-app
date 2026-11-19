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
  };
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
