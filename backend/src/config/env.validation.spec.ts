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
  const validSecret = 'a-test-secret-that-is-at-least-32-characters-long';
  const valid = { DATABASE_URL: validUrl, JWT_SECRET: validSecret };

  it('returns the validated environment when everything is valid', () => {
    expect(validateEnv(valid)).toEqual({
      DATABASE_URL: validUrl,
      JWT_SECRET: validSecret,
    });
  });

  describe('DATABASE_URL', () => {
    it('accepts the postgres:// scheme as well as postgresql://', () => {
      const url = 'postgres://user:pass@host.example.com/db';

      expect(validateEnv({ ...valid, DATABASE_URL: url }).DATABASE_URL).toBe(
        url,
      );
    });

    it.each([
      ['missing', undefined],
      ['blank', '   '],
      ['not a string', 42],
      ['not a url', 'not a url'],
      ['not a postgres url', 'mysql://user:pass@host/db'],
    ])('is rejected when %s', (_label, value) => {
      const config = { ...valid, DATABASE_URL: value };

      expect(errorMessageOf(() => validateEnv(config))).toContain(
        'DATABASE_URL',
      );
    });

    it('does not leak the connection string in the error message', () => {
      const message = errorMessageOf(() =>
        validateEnv({
          ...valid,
          DATABASE_URL: 'mysql://user:topsecret@host/db',
        }),
      );

      expect(message).not.toContain('topsecret');
    });
  });

  describe('JWT_SECRET', () => {
    it('accepts a secret of exactly 32 characters', () => {
      const secret = 'x'.repeat(32);

      expect(validateEnv({ ...valid, JWT_SECRET: secret }).JWT_SECRET).toBe(
        secret,
      );
    });

    it.each([
      ['missing', undefined],
      ['blank', '   '],
      ['not a string', 42],
      ['shorter than 32 characters', 'x'.repeat(31)],
    ])('is rejected when %s', (_label, value) => {
      const config = { ...valid, JWT_SECRET: value };

      expect(errorMessageOf(() => validateEnv(config))).toContain('JWT_SECRET');
    });

    it('does not leak the secret in the error message', () => {
      const tooShort = 'short-but-secret';

      const message = errorMessageOf(() =>
        validateEnv({ ...valid, JWT_SECRET: tooShort }),
      );

      expect(message).toContain('JWT_SECRET');
      expect(message).not.toContain(tooShort);
    });
  });
});
