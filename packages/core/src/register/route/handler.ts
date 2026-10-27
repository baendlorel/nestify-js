import type { AnyFunction, Constructor } from '@core/types/primitives.js';
import type { FilterTask, GuardTask, InterceptorTask, PipeTask } from '@core/types/middleware.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { TaskifyAsync } from 'serial-task';
import { expectArray } from '@core/asserts/index.js';
import { ExecutionContext } from '@core/common/execution-context.js';
import { NestifyInterceptorNextHandler } from '@core/decorators/middlewares/interceptor.js';
import { BadRequestException } from '@core/exceptions/index.js';
import { runReverseInterceptors } from './middlewares/interceptor.js';

interface MiddlewareGroup {
  guard: TaskifyAsync<GuardTask>;
  interceptor: TaskifyAsync<InterceptorTask>;
  pipe: TaskifyAsync<PipeTask>;
  filter: TaskifyAsync<FilterTask>;
}

// TODO 这里写个详细的注释吧
export function createHandler(
  controller: Constructor,
  method: AnyFunction,
  middlewares: MiddlewareGroup,
  attachValidation = false,
  validatorCompiler?: FastifyInstance['validatorCompiler'],
  deferredValidationPart?: 'body' | 'params' | 'querystring',
) {
  const { guard, interceptor, pipe, filter } = middlewares;
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const context = new ExecutionContext(
      [request, reply],
      'http',
      controller,
      method,
      validatorCompiler,
      attachValidation,
      deferredValidationPart,
    );

    try {
      // Guards
      await guard(context);

      // Interceptors
      const interceptResult = await interceptor(context, new NestifyInterceptorNextHandler());

      // FIXED Fastify 将错误附到请求后，在守卫和拦截器执行完交给过滤器；
      // 用户显式设置 attachValidation 时则保留错误供处理方法自行读取。
      if (request.validationError && !attachValidation) {
        throw new BadRequestException(request.validationError.message);
      }

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
      const interceptorNextHandlers = interceptResult.results as NestifyInterceptorNextHandler[];
      result = await runReverseInterceptors(interceptorNextHandlers, result);

      return result;
    } catch (e) {
      // Filter
      await filter(context, e);
    }
  };
}
