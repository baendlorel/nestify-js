import type { InjectToken } from '@core/types/injection.js';
import type { FilterTask, NestifyFilterLike } from '@core/types/middleware.js';

import { createSerialTaskAsync, TaskifyAsync } from 'serial-task';
import { expectArray, expectClass } from '@core/asserts/index.js';
import { injector } from '@core/register/lazy-injector.js';
import { metaGetFilters } from '@core/register/meta.js';
import { HttpException } from '@core/exceptions/index.js';

const defaultFilter: TaskifyAsync<FilterTask> = async (context, exception) => {
  const http = context.switchToHttp();
  const reply = http.getReply();

  if (exception instanceof HttpException) {
    reply.status(exception.statusCode).send(exception.getResponse());
  } else {
    const message = (exception as Error)?.message ?? String(exception);
    reply.status(400).send({
      error: 'Bad Request',
      statusCode: 400,
      message,
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

export function createFilter(tokens: InjectToken[]): TaskifyAsync<FilterTask> {
  const catches = tokens.map((token) => {
    const { cls } = injector.getDetail<NestifyFilterLike>(token);
    expectClass(cls, `Filter token '${String(token)}' must refer to a class, but got ${String(cls)}`);

    const exceptionClasses = metaGetFilters(cls) ?? [];
    expectArray(exceptionClasses, 'exceptions classes must be an array', (c) =>
      expectClass(c, `Filter token expected to be a class, but got ${String(c)}`),
    );
    return exceptionClasses;
  });

  if (tokens.length === 0) {
    return defaultFilter;
  }

  return createSerialTaskAsync<FilterTask>({
    tasks: injector.getMiddlewareHooks<NestifyFilterLike>(tokens, 'catch'),
    resultWrapper: (_task, _i, _tasks, args) => args,
    breakCondition: () => false,
    skipCondition: (_task, i, _tasks, args) => catches[i].some((cls) => args[1] instanceof cls),
  });
}
