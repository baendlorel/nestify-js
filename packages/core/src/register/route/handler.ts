import type { AnyFunction, Constructor } from '@core/types/primitives.js';
import { _isFunction, promiseTry } from '@nestify-js/shared';

import {
  InterceptorNextHandler,
  type FilterTask,
  type GuardTask,
  type InterceptorTask,
  type PipeTask,
} from '@core/types/middleware.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { TaskifyAsync } from 'serial-task';

import { expectArray } from '@core/asserts/index.js';
import { ExecutionContext } from '@core/common/execution-context.js';
import { runReverseInterceptors } from './middlewares/interceptor.js';

interface MiddlewareGroup {
  guard: TaskifyAsync<GuardTask>;
  interceptor: TaskifyAsync<InterceptorTask>;
  pipe: TaskifyAsync<PipeTask>;
  filter: TaskifyAsync<FilterTask>;
}

export function createHandler(controller: Constructor, method: AnyFunction, middlewares: MiddlewareGroup) {
  const { guard, interceptor, pipe, filter } = middlewares;
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const context = new ExecutionContext([request, reply], 'http', controller, method);

    try {
      // Guards
      await guard(context);

      // Interceptors
      const interceptResult = await interceptor(context, new InterceptorNextHandler());

      // Pipes
      const piped = await pipe(context, [], {});
      if (piped.trivial) {
        piped.value = [request, reply];
      } else {
        expectArray(piped.value, `Pipe must return an array, but got: ${String(piped)}`);
      }

      // Controller method
      let result = await method(...piped.value);

      // Interceptor leave
      const interceptorNextHandlers = interceptResult.results as InterceptorNextHandler[];
      result = await runReverseInterceptors(interceptorNextHandlers, result);

      return result;
    } catch (e) {
      // Filter
      await filter(context, e);
    }
  };
}
