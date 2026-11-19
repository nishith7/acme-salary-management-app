import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../generated/prisma/client.js';
import { UsersRepository } from '../users/users.repository.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  INVALID_CREDENTIALS_MESSAGE,
  REFRESH_TOKEN_TTL_MS,
  SESSION_EXPIRED_MESSAGE,
} from './auth.constants.js';
import type { LoginResponse } from './auth.schemas.js';
import { PasswordHasher } from './password-hasher.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from './refresh-token.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

/** What login and refresh both produce: a new access token and a new refresh token. */
export interface SessionResult extends LoginResponse {
  /** For the controller to put in a cookie. It is never part of the response body. */
  refreshToken: { value: string; expiresAt: Date };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly passwords: PasswordHasher,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Checks the credentials and starts a session: a short-lived access token
   * plus a refresh token that begins a new token family.
   */
  async login(email: string, password: string): Promise<SessionResult> {
    const user = await this.users.findByEmail(email);
    // Always verifies, even for an unknown email, so both failures take equally long.
    const passwordMatches = await this.passwords.verify(
      user?.passwordHash,
      password,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const refresh = generateRefreshToken();
    const expiresAt = refreshTokenExpiry(new Date(), REFRESH_TOKEN_TTL_MS);
    await this.refreshTokens.create({
      userId: user.id,
      familyId: randomUUID(),
      tokenHash: refresh.hash,
      expiresAt,
    });

    return this.toSession(user, { value: refresh.token, expiresAt });
  }

  /**
   * Exchanges a refresh token for a new access token and a new refresh token.
   * Every refresh token works once: using it retires it and issues its
   * replacement in the same family.
   *
   * A token that was already used is evidence that a copy exists somewhere it
   * should not, and the real owner cannot be told apart from the thief. So
   * presenting one ends every session in its family and the user logs in again.
   */
  async refresh(presented: string | undefined): Promise<SessionResult> {
    if (!presented) {
      throw this.sessionExpired();
    }

    const now = new Date();
    const current = await this.refreshTokens.findByHash(
      hashRefreshToken(presented),
    );
    if (!current) {
      throw this.sessionExpired();
    }
    if (current.revokedAt) {
      await this.refreshTokens.revokeFamily(current.familyId, now);
      throw this.sessionExpired();
    }
    if (current.expiresAt <= now) {
      throw this.sessionExpired();
    }

    // The user is read fresh, so a role change reaches the next access token.
    const user = await this.users.findById(current.userId);
    if (!user) {
      throw this.sessionExpired();
    }

    const next = generateRefreshToken();
    const expiresAt = refreshTokenExpiry(now, REFRESH_TOKEN_TTL_MS);
    const rotated = await this.refreshTokens.rotate(
      current.id,
      {
        userId: user.id,
        familyId: current.familyId,
        tokenHash: next.hash,
        expiresAt,
      },
      now,
    );
    if (!rotated) {
      // A parallel request used this token between our read and our write.
      await this.refreshTokens.revokeFamily(current.familyId, now);
      throw this.sessionExpired();
    }

    return this.toSession(user, { value: next.token, expiresAt });
  }

  private sessionExpired(): UnauthorizedException {
    return new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
  }

  private async toSession(
    user: User,
    refreshToken: SessionResult['refreshToken'],
  ): Promise<SessionResult> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      refreshToken,
    };
  }
}
