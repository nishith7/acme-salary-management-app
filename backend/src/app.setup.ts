import { INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Env } from './config/env.validation.js';

export const SWAGGER_PATH = 'docs';

/**
 * App-wide configuration shared by main.ts and the e2e tests, so the tests
 * exercise the same setup that runs in production.
 */
export function configureApp(app: INestApplication): void {
  trustProxies(app);
  // Fills request.cookies, which is where the refresh token arrives.
  app.use(cookieParser());
  // Validates any parameter declared with a schema, such as @Body({ schema }),
  // and passes the handler the schema's output (for example a lower-cased email).
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  setupSwagger(app);
}

/**
 * Tells Express how many proxies are in front of the app, so `request.ip` is
 * the real client and not the proxy. The login rate limit counts by that
 * address, so this setting decides who is treated as one client. With 0
 * (the default) X-Forwarded-For is ignored, which is the safe choice when the
 * app is reached directly: a client cannot dodge the limit by forging it.
 */
function trustProxies(app: INestApplication): void {
  const hops = app
    .get<ConfigService<Env, true>>(ConfigService)
    .getOrThrow('TRUST_PROXY', { infer: true });

  if (hops > 0) {
    const express = app.getHttpAdapter().getInstance() as {
      set(setting: string, value: unknown): unknown;
    };
    express.set('trust proxy', hops);
  }
}

function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('ACME Salary Management API')
    .setDescription(
      'API for the HR Manager to maintain salary data and answer questions about how the organisation pays people.',
    )
    .setVersion('0.1.0')
    // Adds the "Authorize" button. Protected routes opt in with @ApiBearerAuth().
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    SWAGGER_PATH,
    app,
    SwaggerModule.createDocument(app, config),
  );
}
