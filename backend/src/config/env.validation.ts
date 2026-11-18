export interface Env {
  DATABASE_URL: string;
}

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

/**
 * Validates the environment at startup so a misconfigured deploy fails fast
 * with a clear message. Error messages never include the value itself, because
 * a connection string contains credentials.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const databaseUrl = config['DATABASE_URL'];

  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('Invalid environment: DATABASE_URL is required');
  }

  if (!isPostgresUrl(databaseUrl)) {
    throw new Error(
      'Invalid environment: DATABASE_URL must be a postgres:// or postgresql:// URL',
    );
  }

  return { DATABASE_URL: databaseUrl };
}

function isPostgresUrl(value: string): boolean {
  try {
    return POSTGRES_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}
