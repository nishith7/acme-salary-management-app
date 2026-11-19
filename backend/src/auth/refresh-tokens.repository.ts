import { Injectable } from '@nestjs/common';
import type { RefreshToken } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface NewRefreshToken {
  userId: string;
  /** Shared by every token issued from one login. */
  familyId: string;
  /** SHA-256 hex digest. The token itself is never stored. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * The only place that queries the refresh_tokens table. Queries only: the
 * rotation and reuse rules belong in AuthService.
 */
@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: NewRefreshToken): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data });
  }

  /** `tokenHash` is the SHA-256 digest of the token the browser sent. */
  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  /**
   * Retires the token `currentId` and stores its replacement, as one atomic
   * step: either both happen or neither does, so a failure cannot log the user
   * out with no new token, or leave two live tokens behind.
   *
   * The token is only retired if it is still active. When another request got
   * there first this changes nothing and returns false, and the caller decides
   * what that means. That check is also what keeps two parallel refreshes from
   * both succeeding.
   */
  rotate(
    currentId: string,
    next: NewRefreshToken,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: currentId, revokedAt: null },
        data: { revokedAt: now },
      });
      if (count === 0) {
        return false;
      }
      await tx.refreshToken.create({ data: next });
      return true;
    });
  }

  /** Ends every session in the family. Tokens that were already revoked keep their original time. */
  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
