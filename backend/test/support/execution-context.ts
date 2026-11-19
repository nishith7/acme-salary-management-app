import type { ExecutionContext } from '@nestjs/common';

type Handler = (...args: never[]) => unknown;
type Controller = abstract new (...args: never[]) => object;

/**
 * A minimal HTTP ExecutionContext for testing a guard on its own: the request
 * the guard sees, plus the handler and controller class whose decorators
 * (@Public, @Roles) the guard reads.
 */
export function httpContext(
  request: object,
  target: { handler: Handler; controller: Controller },
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => target.handler,
    getClass: () => target.controller,
  } as unknown as ExecutionContext;
}
