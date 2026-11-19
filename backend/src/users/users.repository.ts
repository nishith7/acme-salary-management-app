import { Injectable } from '@nestjs/common';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The only place that queries the users table. Queries only: business rules
 * belong in the services, which test against a fake of this class.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `email` must already be lower case; the API normalises it on the way in. */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }
}
