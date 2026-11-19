import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  type LoginRequest,
  type LoginResponse,
  loginResponseSchema,
  loginSchema,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie.js';

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
    const { refreshToken, ...session } = await this.auth.login(
      body.email,
      body.password,
    );

    response.cookie(
      REFRESH_COOKIE_NAME,
      refreshToken.value,
      refreshCookieOptions({
        expiresAt: refreshToken.expiresAt,
        secure: this.config.get<string>('NODE_ENV') === 'production',
      }),
    );

    return session;
  }
}
