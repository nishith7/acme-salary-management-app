import { INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'docs';

/**
 * App-wide configuration shared by main.ts and the e2e tests, so the tests
 * exercise the same setup that runs in production.
 */
export function configureApp(app: INestApplication): void {
  // Validates any parameter declared with a schema, such as @Body({ schema }),
  // and passes the handler the schema's output (for example a lower-cased email).
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  setupSwagger(app);
}

function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('ACME Salary Management API')
    .setDescription(
      'API for the HR Manager to maintain salary data and answer questions about how the organisation pays people.',
    )
    .setVersion('0.1.0')
    .build();

  SwaggerModule.setup(
    SWAGGER_PATH,
    app,
    SwaggerModule.createDocument(app, config),
  );
}
