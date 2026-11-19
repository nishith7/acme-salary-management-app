import { SetMetadata } from '@nestjs/common';
import type { Role } from '../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route (or a whole controller) to users who have any one of the
 * given roles. A route's own roles replace its controller's. At least one role
 * is required, so an empty list cannot silently mean "everyone".
 *
 * A route without this decorator is open to any signed-in user, so every HR
 * controller must carry `@Roles('HR_ADMIN')`.
 */
export const Roles = (...roles: [Role, ...Role[]]) =>
  SetMetadata(ROLES_KEY, roles);
