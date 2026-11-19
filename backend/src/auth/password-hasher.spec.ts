import { PasswordHasher } from './password-hasher.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes with argon2id', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('never stores the password inside the hash', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).not.toContain('correct horse');
  });

  it('salts every hash, so the same password hashes differently each time', async () => {
    const [first, second] = await Promise.all([
      hasher.hash('same password'),
      hasher.hash('same password'),
    ]);

    expect(first).not.toBe(second);
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hasher.hash('right password');

    expect(await hasher.verify(hash, 'right password')).toBe(true);
    expect(await hasher.verify(hash, 'wrong password')).toBe(false);
  });

  it('rejects any password when there is no hash, as when the email is unknown', async () => {
    expect(await hasher.verify(undefined, 'anything')).toBe(false);
  });

  it('treats a malformed hash as a failed login instead of throwing', async () => {
    expect(await hasher.verify('not-an-argon2-hash', 'anything')).toBe(false);
  });
});
