import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

/**
 * argon2id with the OWASP minimum-recommended cost (19 MiB, 2 passes, 1 lane).
 * The library defaults (64 MiB, 4 lanes) are stronger but would let a handful
 * of simultaneous logins exhaust the memory of a small free-tier instance.
 */
const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordHasher {
  /** Created on first use, then reused. See verify(). */
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /**
   * Checks a password against a stored hash. Never throws: a malformed hash is
   * just a failed login.
   *
   * With no hash (the email is unknown) it still does a full verification
   * against a throwaway hash, so an unknown email takes as long as a wrong
   * password and response time does not reveal which accounts exist.
   */
  async verify(
    storedHash: string | undefined,
    password: string,
  ): Promise<boolean> {
    if (storedHash === undefined) {
      this.dummyHash ??= this.hash('dummy password used only to burn time');
      await verify(await this.dummyHash, password).catch(() => false);
      return false;
    }

    try {
      return await verify(storedHash, password);
    } catch {
      return false;
    }
  }
}
