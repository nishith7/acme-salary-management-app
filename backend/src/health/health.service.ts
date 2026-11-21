import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type LivenessResponse,
  type ReadinessErrorResponse,
  type ReadinessResponse,
} from './health.dto.js';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** The process is running. Deliberately does not touch the database. */
  liveness(): LivenessResponse {
    return { status: 'ok' };
  }

  /** The app can serve requests: the database answers a trivial query. */
  async readiness(): Promise<ReadinessResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // Never expose the driver error: it can contain hostnames or usernames.
      const body: ReadinessErrorResponse = {
        status: 'error',
        database: 'down',
      };
      throw new ServiceUnavailableException(body);
    }

    return { status: 'ok', database: 'up' };
  }
}
