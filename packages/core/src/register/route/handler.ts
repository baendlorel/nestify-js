import type { AnyFunction, Constructor } from '@core/types/primitives.js';
import type { FilterTask, GuardTask, InterceptorTask, PipeTask } from '@core/types/middleware.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { TaskifyAsync } from 'serial-task';
import { expectArray } from '@core/asserts/index.js';
import { ExecutionContext } from '@core/common/execution-context.js';
import { NestifyInterceptorNextHandler } from '@core/decorators/middlewares/interceptor.js';
import { runReverseInterceptors } from './middlewares/interceptor.js';

interface MiddlewareGroup {
  guard: TaskifyAsync<GuardTask>;
  interceptor: TaskifyAsync<InterceptorTask>;
  pipe: TaskifyAsync<PipeTask>;
  filter: TaskifyAsync<FilterTask>;
}

export function createHandler(
  controller: Constructor,
  method: AnyFunction,
  middlewares: MiddlewareGroup,
  validatorCompiler?: FastifyInstance['validatorCompiler'],
) {
  const { guard, interceptor, pipe, filter } = middlewares;
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const context = new ExecutionContext([request, reply], 'http', controller, method, validatorCompiler);
    let interceptorHandlers: NestifyInterceptorNextHandler[] = [];

    try {
      // Guards
      await guard(context);

      // Interceptors
      const interceptResult = await interceptor(context, new NestifyInterceptorNextHandler());
      interceptorHandlers = (interceptResult.results as NestifyInterceptorNextHandler[]) ?? [];

      // Pipes
      const piped = await pipe(context, [], {});
      if (piped.trivial) {
        piped.value = [request, reply];
      } else {
        expectArray(piped.value, `Pipe must return an array, but got: ${String(piped)}`);
      }

      // Controller method + interceptor leave
      const result = await method(...piped.value);
      const outcome = await runReverseInterceptors(interceptorHandlers, { ok: true, value: result });
      if (outcome.ok) {
        return outcome.value;
      }

      await filter(context, outcome.error);
    } catch (e) {
      // FIXED 控制器 / pipe / guard 抛出的异常也会依次交给各拦截器的 `catch` 处理（对齐 NestJS 的 catchError），未被恢复时再进入 filter。
      const outcome = await runReverseInterceptors(interceptorHandlers, { ok: false, error: e });
      if (outcome.ok) {
        return outcome.value;
      }

      await filter(context, outcome.error);
    }
  };
}
