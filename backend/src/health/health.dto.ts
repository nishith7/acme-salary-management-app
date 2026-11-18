import { ApiProperty } from '@nestjs/swagger';

export class LivenessResponse {
  @ApiProperty({
    enum: ['ok'],
    example: 'ok',
    description: 'The process is running.',
  })
  status!: 'ok';
}

export class ReadinessResponse {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({
    enum: ['up'],
    example: 'up',
    description: 'The database answered a trivial query.',
  })
  database!: 'up';
}

export class ReadinessErrorResponse {
  @ApiProperty({ enum: ['error'], example: 'error' })
  status!: 'error';

  @ApiProperty({
    enum: ['down'],
    example: 'down',
    description: 'The database could not be reached.',
  })
  database!: 'down';
}
