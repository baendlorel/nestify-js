import type { InjectToken } from '@core/types/injection.js';
import type { InterceptorTask, NestifyInterceptorLike } from '@core/types/middleware.js';
import type { NestifyInstance } from '@core/types/instance.js';

import { createSerialTaskAsync, TaskifyAsync } from 'serial-task';
import { NestifyInterceptorNextHandler, type InterceptorOutcome } from '@core/decorators/middlewares/interceptor.js';

/**
 * Create a preValidation hook for the route
 */
export function createInterceptor(app: NestifyInstance, tokens: InjectToken[]): TaskifyAsync<InterceptorTask> {
  return createSerialTaskAsync<InterceptorTask>({
    tasks: app.injector.getMiddlewareHooks<NestifyInterceptorLike>(tokens, 'intercept'),
    resultWrapper: (_task, _i, _tasks, args) => [args[0], new NestifyInterceptorNextHandler()],
    breakCondition: () => false,
    skipCondition: () => false,
  });
}

/**
 * Use to run interceptors.
 * - Not using serial task because we need to be easier.
 * - Runs from the innermost interceptor to the outermost one, carrying either the
 *   controller result or the downstream error, so `catch` sees errors of the whole chain.
 */
export async function runReverseInterceptors(
  inh: NestifyInterceptorNextHandler[],
  initial: InterceptorOutcome,
): Promise<InterceptorOutcome> {
  let outcome = initial;

  for (let i = inh.length - 1; i >= 0; i--) {
    outcome = await inh[i].runOutcome(outcome);
  }

  return outcome;
}
