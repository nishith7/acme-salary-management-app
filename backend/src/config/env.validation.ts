export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
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

  return { DATABASE_URL: databaseUrl, JWT_SECRET: jwtSecret };
}

function isPostgresUrl(value: string): boolean {
  try {
    return POSTGRES_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}
