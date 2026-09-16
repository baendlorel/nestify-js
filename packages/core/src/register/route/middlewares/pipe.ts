import { createSerialTaskAsync, TaskifyAsync } from 'serial-task';
import type { PipeOptions, PipeTask, PipeFullSchema, NestifyPipeLike } from '@core/types/middleware.js';
import type { NestifyInstance } from '@core/types/instance.js';
import { InjectToken } from '@core/types/injection.js';

export function createPipe(app: NestifyInstance, pipeOpts: PipeOptions[]): TaskifyAsync<PipeTask> {
  const tokens: InjectToken[] = [];
  const schemas: (PipeFullSchema | undefined)[] = [];

  for (let i = 0; i < pipeOpts.length; i++) {
    const { pipe, schema } = pipeOpts[i];
    tokens.push(pipe as InjectToken);
    schemas.push(schema);
  }

  return createSerialTaskAsync<PipeTask>({
    tasks: app.injector.getMiddlewareHooks<NestifyPipeLike>(tokens, 'transform'),
    // * the [cx] is the initial args of the whole pipeline.
    // So it would be [context, input?, schema?]
    // & Fisrt call of the whole task will use this wrapper to wrap values.
    resultWrapper: (_task, i, _tasks, [cx], lastReturn) => [cx, lastReturn, schemas[i]],
    breakCondition: () => false,
    skipCondition: () => false,
  });
}
