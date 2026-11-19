import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  type LoginRequest,
  type LoginResponse,
  loginResponseSchema,
  loginSchema,
} from './auth.schemas.js';
import { AuthService, type SessionResult } from './auth.service.js';
import {
  clearRefreshCookieOptions,
  readRefreshCookie,
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
} from './refresh-cookie.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in',
    description:
      'Exchanges an email and password for a short-lived access token (15 minutes). A refresh token is set as an httpOnly cookie and is never part of the response body.',
  })
  @ApiOkResponse({
    standardSchema: loginResponseSchema,
    description: 'Logged in. The refresh token cookie is set.',
  })
  @ApiBadRequestResponse({ description: 'The request body is invalid.' })
  @ApiUnauthorizedResponse({
    description:
      'The email or password is wrong. The message does not say which.',
  })
  async login(
    @Body({ schema: loginSchema }) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const session = await this.auth.login(body.email, body.password);
    return this.respondWithSession(response, session);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh the session',
    description:
      'Reads the refresh token from its httpOnly cookie and returns a new access token, in the same shape as login. The refresh token works once: a new one replaces it in the cookie. Presenting a token that was already used ends every session that came from the same login.',
  })
  @ApiOkResponse({
    standardSchema: loginResponseSchema,
    description:
      'A new access token. The cookie now holds a new refresh token.',
  })
  @ApiUnauthorizedResponse({
    description:
      'The cookie is missing, unknown, expired or was already used. The cookie is cleared and the user must log in again.',
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    try {
      const session = await this.auth.refresh(readRefreshCookie(request));
      return this.respondWithSession(response, session);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        // A refused token is useless, so stop the browser sending it again.
        this.clearRefreshCookie(response);
      }
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Log out',
    description:
      'Ends the session the refresh cookie belongs to: every refresh token from that login stops working, and the cookie is cleared. It needs no access token, so it works after the access token has expired. Other devices stay logged in. It always succeeds, even with no cookie or an unknown one.',
  })
  @ApiNoContentResponse({
    description: 'Logged out. The refresh token cookie is cleared.',
  })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(request));
    this.clearRefreshCookie(response);
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(
      REFRESH_COOKIE_NAME,
      clearRefreshCookieOptions({ secure: this.useSecureCookies() }),
    );
  }

  /** Puts the refresh token in its cookie and returns the rest as the response body. */
  private respondWithSession(
    response: Response,
    { refreshToken, ...session }: SessionResult,
  ): LoginResponse {
    response.cookie(
      REFRESH_COOKIE_NAME,
      refreshToken.value,
      refreshCookieOptions({
        expiresAt: refreshToken.expiresAt,
        secure: this.useSecureCookies(),
      }),
    );
    return session;
  }

  private useSecureCookies(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }
}
