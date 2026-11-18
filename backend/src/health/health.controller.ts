import { Controller, Get } from '@nestjs/common';
import {
  HealthService,
  type LivenessStatus,
  type ReadinessStatus,
} from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** For platform health checks. No database access, so polling it is free. */
  @Get()
  liveness(): LivenessStatus {
    return this.health.liveness();
  }

  /** Verifies the database connection. Use sparingly: it wakes a sleeping Neon database. */
  @Get('ready')
  readiness(): Promise<ReadinessStatus> {
    return this.health.readiness();
  }
}
