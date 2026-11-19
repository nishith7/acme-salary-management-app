import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.validation.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { LOGIN_RATE_LIMITED_MESSAGE } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PasswordHasher } from './password-hasher.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      // Only the secret is set here; the algorithm and lifetime are passed on
      // each sign() call, where AuthService owns them.
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
    // The rate limit for login. It is not a global guard: only routes that
    // add ThrottlerGuard are limited, and today that is login alone. Counts
    // are kept in memory, so they are per process and reset on restart, which
    // is fine for one instance. The limit is per client address, set from
    // the environment, and the address comes from req.ip (see TRUST_PROXY).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        errorMessage: LOGIN_RATE_LIMITED_MESSAGE,
        throttlers: [
          {
            // Must stay 'default': any other name makes the throttler send
            // "Retry-After-<name>", which no client understands. The cost is
            // that any route that later adds ThrottlerGuard shares this limit,
            // so give such a route its own @Throttle(...) values.
            name: 'default',
            limit: config.getOrThrow('LOGIN_RATE_LIMIT', { infer: true }),
            ttl:
              config.getOrThrow('LOGIN_RATE_WINDOW_SECONDS', { infer: true }) *
              1000,
          },
        ],
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHasher,
    RefreshTokensRepository,
    // Global guards, in this order: authenticate first, then check the role.
    // That order is why a request with no token gets a 401, never a 403.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
