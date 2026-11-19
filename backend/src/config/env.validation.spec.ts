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
      TRUST_PROXY: 0,
      LOGIN_RATE_LIMIT: 5,
      LOGIN_RATE_WINDOW_SECONDS: 60,
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

  describe('proxy and login rate limit settings', () => {
    it('defaults to no trusted proxy and 5 login attempts per 60 seconds', () => {
      expect(validateEnv(valid)).toMatchObject({
        TRUST_PROXY: 0,
        LOGIN_RATE_LIMIT: 5,
        LOGIN_RATE_WINDOW_SECONDS: 60,
      });
    });

    // [variable, default, lowest allowed, highest allowed]
    const settings = [
      ['TRUST_PROXY', 0, 0, 10],
      ['LOGIN_RATE_LIMIT', 5, 1, 10_000],
      ['LOGIN_RATE_WINDOW_SECONDS', 60, 1, 86_400],
    ] as const;

    describe.each(settings)('%s', (name, fallback, lowest, highest) => {
      const read = (value: unknown) =>
        validateEnv({ ...valid, [name]: value })[name];

      it('falls back to its default when it is blank, like an empty line in .env', () => {
        expect(read('')).toBe(fallback);
        expect(read('   ')).toBe(fallback);
      });

      it('reads a numeric string, which is how environment variables arrive', () => {
        expect(read(String(highest))).toBe(highest);
      });

      it('accepts a number as well', () => {
        expect(read(lowest)).toBe(lowest);
      });

      it('accepts the lowest and the highest allowed value', () => {
        expect(read(String(lowest))).toBe(lowest);
        expect(read(String(highest))).toBe(highest);
      });

      it.each([
        ['negative', '-1'],
        ['a decimal', '1.5'],
        ['not a number', 'abc'],
        ['in exponent form', '1e3'],
        ['in hex', '0x10'],
        ['a number with text after it', '5 requests'],
        ['above the highest allowed value', String(highest + 1)],
        ['below the lowest allowed value', String(lowest - 1)],
        ['not a string or a number', true],
      ])('is rejected when %s', (_label, value) => {
        expect(errorMessageOf(() => read(value))).toContain(name);
      });

      it('does not echo the rejected value in the error message', () => {
        const message = errorMessageOf(() => read('definitely-not-a-number'));

        expect(message).toContain(name);
        expect(message).not.toContain('definitely-not-a-number');
      });
    });
  });
});
