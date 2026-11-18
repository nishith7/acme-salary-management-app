import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection. The running API uses
    // the pooled DATABASE_URL through the pg driver adapter instead.
    url: process.env['DIRECT_URL'],
  },
});
