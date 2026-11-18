import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthService } from './health.service.js';

function createService(queryRaw: ReturnType<typeof vi.fn>): HealthService {
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  return new HealthService(prisma);
}

describe('HealthService', () => {
  describe('liveness', () => {
    it('reports ok without touching the database', () => {
      const queryRaw = vi.fn();

      expect(createService(queryRaw).liveness()).toEqual({ status: 'ok' });
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('readiness', () => {
    it('reports the database as up when the ping succeeds', async () => {
      const service = createService(vi.fn().mockResolvedValue([{ ok: 1 }]));

      await expect(service.readiness()).resolves.toEqual({
        status: 'ok',
        database: 'up',
      });
    });

    it('throws service unavailable when the ping fails', async () => {
      const service = createService(
        vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
      );

      await expect(service.readiness()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('does not leak the underlying error in the response body', async () => {
      const service = createService(
        vi
          .fn()
          .mockRejectedValue(
            new Error('password authentication failed for user "default"'),
          ),
      );

      const error = await service.readiness().catch((e: unknown) => e);

      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        status: 'error',
        database: 'down',
      });
    });
  });
});
