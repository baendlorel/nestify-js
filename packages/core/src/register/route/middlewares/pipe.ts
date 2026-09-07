import { createSerialTaskAsync, TaskifyAsync } from 'serial-task';
import type { PipeOptions, PipeTask, PipeFullSchema, NestifyPipeLike } from '@core/types/middleware.js';
import { InjectToken } from '@core/types/injection.js';

import { injector } from '@core/register/lazy-injector.js';

export function createPipe(pipeOpts: PipeOptions[]): TaskifyAsync<PipeTask> {
  const tokens: InjectToken[] = [];
  const schemas: (PipeFullSchema | undefined)[] = [];

  for (let i = 0; i < pipeOpts.length; i++) {
    const { pipe, schema } = pipeOpts[i];
    tokens.push(pipe as InjectToken);
    schemas.push(schema);
  }

  return createSerialTaskAsync<PipeTask>({
    tasks: injector.getMiddlewareHooks<NestifyPipeLike>(tokens, 'transform'),
    // * the [cx] is the initial args of the whole pipeline.
    // So it would be [context, input?, schema?]
    // & Fisrt call of the whole task will use this wrapper to wrap values.
    resultWrapper: (_task, i, _tasks, [cx], lastReturn) => [cx, lastReturn, schemas[i]],
    breakCondition: () => false,
    skipCondition: () => false,
  });
}
