import type { ProviderOptions } from './types/injection.js';

import { PipeBody } from './pipes/body.pipe.js';
import { PipeParams } from './pipes/params.pipe.js';
import { PipeIp } from './pipes/ip.pipe.js';
import { PipeQuery } from './pipes/query.pipe.js';
import { PipeRaw } from './pipes/raw.pipe.js';
import { JwtGuard } from './auth/jwt.guard.js';
import { ThrottleGuard } from './decorators/router/throttle.js';

/**
 * Built-in middlewares that are prepended to `registerGlobalMiddlewares`
 * during `apply()`.
 * - Only registered (instantiated), no global effect
 * - so they can be used via `@UsePipes(...)` / `@UseGuards(...)` directly
 */
export const BuiltinMiddlewares: ProviderOptions[] = [
  PipeBody,
  PipeParams,
  PipeIp,
  PipeQuery,
  PipeRaw,
  JwtGuard(),
  ThrottleGuard,
];
