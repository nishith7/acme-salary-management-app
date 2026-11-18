import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  LivenessResponse,
  ReadinessErrorResponse,
  ReadinessResponse,
} from './health.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness check',
    description:
      'Confirms the process is running. Never queries the database, so it is safe for platform health checks to poll.',
  })
  @ApiOkResponse({ type: LivenessResponse })
  liveness(): LivenessResponse {
    return this.health.liveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness check',
    description:
      'Confirms the database answers a trivial query. Wakes a sleeping Neon database, so use it for manual checks and deploy verification rather than frequent polling.',
  })
  @ApiOkResponse({
    type: ReadinessResponse,
    description: 'The database is reachable.',
  })
  @ApiServiceUnavailableResponse({
    type: ReadinessErrorResponse,
    description: 'The database is unreachable.',
  })
  readiness(): Promise<ReadinessResponse> {
    return this.health.readiness();
  }
}
