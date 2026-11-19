import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from './refresh-token.js';

describe('hashRefreshToken', () => {
  it('returns the SHA-256 hex digest', () => {
    // Standard SHA-256 test vector for the input "abc".
    expect(hashRefreshToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is 64 hex characters, which is what the char(64) column holds', () => {
    expect(hashRefreshToken('any token')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives the same hash for the same token and a different one otherwise', () => {
    expect(hashRefreshToken('token-a')).toBe(hashRefreshToken('token-a'));
    expect(hashRefreshToken('token-a')).not.toBe(hashRefreshToken('token-b'));
  });
});

describe('generateRefreshToken', () => {
  it('returns a url-safe token carrying 256 bits (43 base64url characters)', () => {
    expect(generateRefreshToken().token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('returns the hash of the token it returns', () => {
    const { token, hash } = generateRefreshToken();

    expect(hash).toBe(hashRefreshToken(token));
  });

  it('does not give away the token in its hash', () => {
    const { token, hash } = generateRefreshToken();

    expect(hash).not.toContain(token);
  });

  it('never returns the same token twice', () => {
    const tokens = new Set(
      Array.from({ length: 1000 }, () => generateRefreshToken().token),
    );

    expect(tokens.size).toBe(1000);
  });
});

describe('refreshTokenExpiry', () => {
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  it('adds the lifetime to the time it is given', () => {
    const issuedAt = new Date('2026-11-19T10:00:00.000Z');

    expect(refreshTokenExpiry(issuedAt, sevenDays)).toEqual(
      new Date('2026-11-26T10:00:00.000Z'),
    );
  });

  it('does not change the date it is given', () => {
    const issuedAt = new Date('2026-11-19T10:00:00.000Z');

    refreshTokenExpiry(issuedAt, sevenDays);

    expect(issuedAt).toEqual(new Date('2026-11-19T10:00:00.000Z'));
  });
});
