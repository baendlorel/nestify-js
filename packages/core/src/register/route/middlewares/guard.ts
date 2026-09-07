import { createSerialTaskAsync, TaskifyAsync } from 'serial-task';
import type { GuardTask, NestifyGuardLike } from '@core/types/middleware.js';
import { InjectToken } from '@core/types/injection.js';

import { ForbiddenException } from '@core/exceptions/index.js';
import { injector } from '@core/register/lazy-injector.js';
import { ExecutionContext } from '@core/common/execution-context.js';

/**
 * Create a preValidation hook for the route
 */
export function createGuard(tokens: InjectToken[]): TaskifyAsync<GuardTask> {
  const task = createSerialTaskAsync<GuardTask>({
    tasks: injector.getMiddlewareHooks<NestifyGuardLike>(tokens, 'canActivate'),
    resultWrapper: (_task, _i, _tasks, args) => args,
    breakCondition: (_task, _i, _tasks, _args, lastReturn) => lastReturn === false,
    skipCondition: () => false,
  });

  return async function (context: ExecutionContext) {
    // & Guards can return false or throw an error
    // If it throws, the error will be taken over by Filter(onError handler)
    const result = await task(context);
    if (result.value === false) {
      throw new ForbiddenException();
    }
    return result;
  };
}
