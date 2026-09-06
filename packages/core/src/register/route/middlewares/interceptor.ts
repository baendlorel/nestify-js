import type { InjectToken } from '@core/types/injection.js';

import { promiseTry } from '@nestify-js/shared';
import { createSerialTaskAsync, TaskifyAsync } from 'serial-task';
import { InterceptorNextHandler, type InterceptorTask, type NestifyInterceptor } from '@core/types/middleware.js';
import { injector } from '@core/register/lazy-injector.js';

/**
 * Create a preValidation hook for the route
 */
export function createInterceptor(tokens: InjectToken[]): TaskifyAsync<InterceptorTask> {
  return createSerialTaskAsync<InterceptorTask>({
    tasks: injector.getMiddlewareHooks<NestifyInterceptor>(tokens, 'intercept'),
    resultWrapper: (_task, _i, _tasks, args) => [args[0], new InterceptorNextHandler()],
    breakCondition: () => false,
    skipCondition: () => false,
  });
}

const Void = Symbol();

/**
 * Use to run interceptors.
 * - Not using serial task because we need to be easier.
 */
export async function runReverseInterceptors(inh: InterceptorNextHandler[], controllerReturn: any) {
  let result = controllerReturn;
  let err = Void;

  const resolve = (v: any) => {
    result = v;
    err = Void;
  };
  const reject = (e: any) => {
    err = e;
  };

  // Run reversely
  for (let i = inh.length - 1; i >= 0; i--) {
    const h = inh[i];

    // Result not null, means success
    await promiseTry(h.onNext, result).then(resolve).catch(reject);

    // Means should go to error handle
    if (err !== Void) {
      await promiseTry(h.onError, err).then(resolve).catch(reject);
    }

    // ! If there is still an error, throw it. Following interceptors are ignored.
    if (err !== Void) {
      throw err;
    }
  }

  return result;
}
