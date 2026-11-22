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

  it('returns the validated environment, with the defaults, when everything required is valid', () => {
    expect(validateEnv(valid)).toEqual({
      DATABASE_URL: validUrl,
      JWT_SECRET: validSecret,
      TRUST_PROXY: 0,
      LOGIN_RATE_LIMIT: 5,
      LOGIN_RATE_WINDOW_SECONDS: 60,
      CORS_ORIGINS: [],
      REFRESH_COOKIE_SAMESITE: 'strict',
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

  describe('CORS_ORIGINS, the sites whose pages may call the API', () => {
    const read = (value: unknown) =>
      validateEnv({ ...valid, CORS_ORIGINS: value }).CORS_ORIGINS;

    it('allows no site when it is blank, so a browser on another site gets nothing', () => {
      expect(read('   ')).toEqual([]);
    });

    it('reads a comma-separated list, ignoring spaces and empty entries', () => {
      expect(read(' http://localhost:5173 , https://hr.example.com ,')).toEqual(
        ['http://localhost:5173', 'https://hr.example.com'],
      );
    });

    it.each([
      ['a wildcard, which cannot be combined with cookies', '*'],
      ['an address with a path', 'http://localhost:5173/app'],
      ['an address with no scheme', 'localhost:5173'],
      ['one bad entry among good ones', 'http://localhost:5173,nonsense'],
    ])('refuses %s, naming the variable and not the value', (_what, value) => {
      const message = errorMessageOf(() => read(value));

      expect(message).toContain('CORS_ORIGINS');
      expect(message).not.toContain(value);
    });
  });

  describe('proxy and login rate limit settings', () => {
    // [variable, lowest allowed, highest allowed]
    const settings = [
      ['TRUST_PROXY', 0, 10],
      ['LOGIN_RATE_LIMIT', 1, 10_000],
      ['LOGIN_RATE_WINDOW_SECONDS', 1, 86_400],
    ] as const;
    const read = (name: string, value: unknown) =>
      validateEnv({ ...valid, [name]: value }) as unknown as Record<
        string,
        unknown
      >;

    it.each(settings)(
      '%s: a blank line means the default, and the lowest and highest allowed values are read from text',
      (name, lowest, highest) => {
        const fallback = validateEnv(valid)[name];

        expect(read(name, '   ')[name]).toBe(fallback);
        expect(read(name, String(lowest))[name]).toBe(lowest);
        expect(read(name, String(highest))[name]).toBe(highest);
      },
    );

    it.each(settings)(
      '%s: is rejected just outside its range',
      (name, lowest, highest) => {
        expect(errorMessageOf(() => read(name, String(lowest - 1)))).toContain(
          name,
        );
        expect(errorMessageOf(() => read(name, String(highest + 1)))).toContain(
          name,
        );
      },
    );

    // Number() would quietly accept the last three of these as 1000, 16 and so on.
    it.each([
      ['a decimal', '1.5'],
      ['not a number', 'abc'],
      ['in exponent form', '1e3'],
      ['in hex', '0x10'],
      ['a number with text after it', '5 requests'],
    ])('is rejected when it is %s', (_label, value) => {
      expect(errorMessageOf(() => read('LOGIN_RATE_LIMIT', value))).toContain(
        'LOGIN_RATE_LIMIT',
      );
    });

    it('does not echo the rejected value in the error message', () => {
      const message = errorMessageOf(() =>
        read('LOGIN_RATE_LIMIT', 'definitely-not-a-number'),
      );

      expect(message).toContain('LOGIN_RATE_LIMIT');
      expect(message).not.toContain('definitely-not-a-number');
    });
  });

  describe('REFRESH_COOKIE_SAMESITE', () => {
    it('accepts strict, lax and none, in any case, and is strict when left blank', () => {
      for (const value of ['strict', 'lax', 'none', 'None', ' LAX ']) {
        expect(
          validateEnv({ ...valid, REFRESH_COOKIE_SAMESITE: value })
            .REFRESH_COOKIE_SAMESITE,
        ).toBe(value.trim().toLowerCase());
      }
      expect(
        validateEnv({ ...valid, REFRESH_COOKIE_SAMESITE: '' })
          .REFRESH_COOKIE_SAMESITE,
      ).toBe('strict');
    });

    it('refuses anything else, naming the variable and not echoing the value', () => {
      const message = errorMessageOf(() =>
        validateEnv({ ...valid, REFRESH_COOKIE_SAMESITE: 'sometimes-secret' }),
      );

      expect(message).toContain('REFRESH_COOKIE_SAMESITE');
      expect(message).not.toContain('sometimes-secret');
    });
  });
});
