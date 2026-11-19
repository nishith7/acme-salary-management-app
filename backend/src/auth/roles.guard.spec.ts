import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { httpContext } from '../../test/support/execution-context.js';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from './authenticated-user.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

class ProbeController {
  anyone(this: void) {}

  @Roles('HR_ADMIN')
  hrOnly(this: void) {}

  @Roles('HR_ADMIN', 'EMPLOYEE')
  eitherRole(this: void) {}
}

@Roles('HR_ADMIN')
class HrController {
  inherited(this: void) {}

  @Roles('EMPLOYEE')
  overridden(this: void) {}
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const hr: AuthenticatedUser = {
    id: '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11',
    role: 'HR_ADMIN',
  };
  const employee: AuthenticatedUser = { ...hr, role: 'EMPLOYEE' };

  const check = (
    user: AuthenticatedUser | undefined,
    handler: () => void,
    controller: abstract new () => object,
  ) =>
    guard.canActivate(
      httpContext({ user } as AuthenticatedRequest, { handler, controller }),
    );

  it('lets any signed-in user through a route that names no roles', () => {
    expect(
      check(employee, ProbeController.prototype.anyone, ProbeController),
    ).toBe(true);
    expect(check(hr, ProbeController.prototype.anyone, ProbeController)).toBe(
      true,
    );
  });

  it('lets a route that names no roles through without a user, for public routes', () => {
    expect(
      check(undefined, ProbeController.prototype.anyone, ProbeController),
    ).toBe(true);
  });

  it('lets a user with the required role through', () => {
    expect(check(hr, ProbeController.prototype.hrOnly, ProbeController)).toBe(
      true,
    );
  });

  it('rejects a user without the required role with 403', () => {
    expect(() =>
      check(employee, ProbeController.prototype.hrOnly, ProbeController),
    ).toThrow(ForbiddenException);
  });

  it('rejects with 403 when a role is required and there is no user, rather than letting it through', () => {
    expect(() =>
      check(undefined, ProbeController.prototype.hrOnly, ProbeController),
    ).toThrow(ForbiddenException);
  });

  it('lets in a user who has any one of several allowed roles', () => {
    expect(
      check(employee, ProbeController.prototype.eitherRole, ProbeController),
    ).toBe(true);
    expect(
      check(hr, ProbeController.prototype.eitherRole, ProbeController),
    ).toBe(true);
  });

  describe('with roles on the controller', () => {
    it('applies them to every route of the controller', () => {
      expect(check(hr, HrController.prototype.inherited, HrController)).toBe(
        true,
      );
      expect(() =>
        check(employee, HrController.prototype.inherited, HrController),
      ).toThrow(ForbiddenException);
    });

    it('lets a route’s own roles replace the controller’s', () => {
      expect(
        check(employee, HrController.prototype.overridden, HrController),
      ).toBe(true);
      expect(() =>
        check(hr, HrController.prototype.overridden, HrController),
      ).toThrow(ForbiddenException);
    });
  });
});
