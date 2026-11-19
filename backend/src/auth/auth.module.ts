import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

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
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordHasher, RefreshTokensRepository],
})
export class AuthModule {}
