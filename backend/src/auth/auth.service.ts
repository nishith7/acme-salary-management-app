import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersRepository } from '../users/users.repository.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  INVALID_CREDENTIALS_MESSAGE,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants.js';
import type { LoginResponse } from './auth.schemas.js';
import { PasswordHasher } from './password-hasher.js';
import { generateRefreshToken, refreshTokenExpiry } from './refresh-token.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

export interface LoginResult extends LoginResponse {
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
  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.users.findByEmail(email);
    // Always verifies, even for an unknown email, so both failures take equally long.
    const passwordMatches = await this.passwords.verify(
      user?.passwordHash,
      password,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );

    const refresh = generateRefreshToken();
    const expiresAt = refreshTokenExpiry(new Date(), REFRESH_TOKEN_TTL_MS);
    await this.refreshTokens.create({
      userId: user.id,
      familyId: randomUUID(),
      tokenHash: refresh.hash,
      expiresAt,
    });

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      refreshToken: { value: refresh.token, expiresAt },
    };
  }
}
