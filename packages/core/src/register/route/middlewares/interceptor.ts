import type { InjectToken } from '@core/types/injection.js';
import type { InterceptorTask, NestifyInterceptorLike } from '@core/types/middleware.js';

import { createSerialTaskAsync, TaskifyAsync } from 'serial-task';
import { injector } from '@core/register/lazy-injector.js';
import { NestifyInterceptorNextHandler } from '@core/decorators/middlewares/interceptor.js';

/**
 * Create a preValidation hook for the route
 */
export function createInterceptor(tokens: InjectToken[]): TaskifyAsync<InterceptorTask> {
  return createSerialTaskAsync<InterceptorTask>({
    tasks: injector.getMiddlewareHooks<NestifyInterceptorLike>(tokens, 'intercept'),
    resultWrapper: (_task, _i, _tasks, args) => [args[0], new NestifyInterceptorNextHandler()],
    breakCondition: () => false,
    skipCondition: () => false,
  });
}

/**
 * Use to run interceptors.
 * - Not using serial task because we need to be easier.
 */
export async function runReverseInterceptors(inh: NestifyInterceptorNextHandler[], controllerReturn: any) {
  let result = controllerReturn;

  for (let i = inh.length - 1; i >= 0; i--) {
    result = await inh[i].run(result);
  }

  return result;
}
