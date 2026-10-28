import type { InjectToken } from '@core/types/injection.js';
import type { FilterTask, NestifyFilterLike } from '@core/types/middleware.js';
import type { NestifyInstance } from '@core/types/instance.js';

import { createSerialTaskAsync, TaskifyAsync } from 'serial-task';
import { HttpStatus } from '@nestify-js/shared';
import { expectArray, expectClass } from '@core/asserts/index.js';
import { metaGetFilters } from '@core/register/meta.js';
import { HttpException } from '@core/exceptions/index.js';
import ph from '@core/register/provider.js';

/**
 * Fallback filter used when no custom filter handled the exception.
 * - `HttpException` keeps its own status and response
 * - Unknown errors are logged and reported as a generic 500, so internal messages never leak
 */
function createDefaultFilter(app: NestifyInstance): TaskifyAsync<FilterTask> {
  return async (context, exception) => {
    const http = context.switchToHttp();
    const reply = http.getReply();

    if (exception instanceof HttpException) {
      reply.status(exception.statusCode).send(exception.getResponse());
    } else {
      // FIXED 未知异常不再按 400 返回原始 error.message：改为记录服务端日志并返回通用 500，避免误报客户端错误和泄露内部信息。
      app.log.error({ err: exception }, 'Unhandled exception');
      reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
    }

    return {
      value: undefined,
      results: [],
      trivial: true,
      breakAt: -1,
      skipped: [],
    };
  };
}

export function createFilter(app: NestifyInstance, tokens: InjectToken[]): TaskifyAsync<FilterTask> {
  const fallback = createDefaultFilter(app);

  const catches = tokens.map((token) => {
    const { cls } = app.injector.getDetail<NestifyFilterLike>(token);
    expectClass(cls, `Filter token '${ph.getName(token)}' must refer to a class, but got ${String(cls)}`);

    const exceptionClasses = metaGetFilters(cls) ?? [];
    expectArray(exceptionClasses, 'exceptions classes must be an array', (c) =>
      expectClass(c, `Filter token expected to be a class, but got ${String(c)}`),
    );
    return exceptionClasses;
  });

  if (tokens.length === 0) {
    return fallback;
  }

  const task = createSerialTaskAsync<FilterTask>({
    tasks: app.injector.getMiddlewareHooks<NestifyFilterLike>(tokens, 'catch'),
    resultWrapper: (_task, _i, _tasks, args) => args,
    // FIXED 已发送响应后停止，避免后续过滤器重复发送。
    breakCondition: (_task, _i, _tasks, [cx]) => cx.switchToHttp().getReply().sent,
    // FIXED 只跳过不匹配的异常类型；未指定类型的过滤器捕获所有异常。
    skipCondition: (_task, i, _tasks, args) =>
      catches[i].length > 0 && !catches[i].some((cls) => args[1] instanceof cls),
  });

  return async (cx, exception) => {
    const result = await task(cx, exception);
    // FIXED 没有过滤器发送响应时使用默认处理，防止未匹配或未处理的异常导致请求悬挂。
    if (!cx.switchToHttp().getReply().sent) {
      return fallback(cx, exception);
    }
    return result;
  };
}
