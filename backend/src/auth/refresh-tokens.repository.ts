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
}
