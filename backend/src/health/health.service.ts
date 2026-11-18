import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface LivenessStatus {
  status: 'ok';
}

export interface ReadinessStatus {
  status: 'ok';
  database: 'up';
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** The process is running. Deliberately does not touch the database. */
  liveness(): LivenessStatus {
    return { status: 'ok' };
  }

  /** The app can serve requests: the database answers a trivial query. */
  async readiness(): Promise<ReadinessStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // Never expose the driver error: it can contain hostnames or usernames.
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }

    return { status: 'ok', database: 'up' };
  }
}
