import { validateEnv } from './env.validation.js';

function errorMessageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('validateEnv', () => {
  const validUrl =
    'postgresql://user:pass@host.example.com/db?sslmode=verify-full';

  it('returns the validated environment when DATABASE_URL is a postgres url', () => {
    expect(validateEnv({ DATABASE_URL: validUrl })).toEqual({
      DATABASE_URL: validUrl,
    });
  });

  it('accepts the postgres:// scheme as well as postgresql://', () => {
    const url = 'postgres://user:pass@host.example.com/db';

    expect(validateEnv({ DATABASE_URL: url })).toEqual({ DATABASE_URL: url });
  });

  it.each([
    ['missing', {}],
    ['blank', { DATABASE_URL: '   ' }],
    ['not a string', { DATABASE_URL: 42 }],
    ['not a url', { DATABASE_URL: 'not a url' }],
    ['not a postgres url', { DATABASE_URL: 'mysql://user:pass@host/db' }],
  ])('rejects the environment when DATABASE_URL is %s', (_label, config) => {
    expect(errorMessageOf(() => validateEnv(config))).toContain('DATABASE_URL');
  });

  it('does not leak the connection string in the error message', () => {
    const message = errorMessageOf(() =>
      validateEnv({ DATABASE_URL: 'mysql://user:topsecret@host/db' }),
    );

    expect(message).not.toContain('topsecret');
  });
});
