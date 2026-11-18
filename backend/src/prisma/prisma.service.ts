import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.validation.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The single Prisma client for the app. It uses the pooled DATABASE_URL via the
 * pg driver adapter. The connection is opened lazily on the first query, so a
 * sleeping database never blocks application startup.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow('DATABASE_URL', { infer: true }),
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
