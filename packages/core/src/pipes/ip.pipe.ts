import type { ExecutionContext } from '@core/common/execution-context.js';
import type { PipeFullSchema } from '@core/types/middleware.js';
import { _PipeSet, NestifyPipe } from '@core/decorators/middlewares/pipe.js';
import { basicTransformer } from './basic-transformer.js';

class PipeIp extends NestifyPipe {
  async transform(context: ExecutionContext, _input?: any[], schema?: PipeFullSchema) {
    return basicTransformer(context, 'ip', schema);
  }
}

_PipeSet(PipeIp);
export { PipeIp };
