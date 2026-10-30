import type { AnyFunction, Constructor, SSKey } from '@core/types/primitives.js';
import type { ExecutionContext } from '@core/common/execution-context.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { expect, expectObject } from '@core/asserts/index.js';
import { TooManyRequestsException } from '@core/exceptions/index.js';
import { getClassMetadata, getMethodMetadata, createDecorator } from '@core/decorators/custom.js';
import { metaSetUseGuards } from '@core/register/meta.js';

import { _GuardSet, NestifyGuard } from '../middlewares/guard.js';
import { expectMiddleware } from '../middlewares/expect-middleware.js';

/**
 * Rate limit window used by `@Throttle`.
 */
export interface ThrottleOptions {
  /**
   * Maximum number of requests allowed within one `ttl` window.
   * - `0` disables throttling for the decorated class / handler
   */
  limit: number;

  /** Window size in milliseconds. */
  ttl: number;
}

export type ThrottleInput = ThrottleOptions;

/** Metadata key of the normalized `@Throttle` options. */
const THROTTLE_KEY = Symbol('nestify-throttle');

/** Stores the normalized options on the class / method metadata. */
const setThrottleOptions = createDecorator<ThrottleOptions>(THROTTLE_KEY);

/** Do not let an unbounded number of clients grow the in-memory store. */
const MAX_TRACKED_CLIENTS = 1000;

/** Back-off state of one client on one route. */
interface ThrottleWindow {
  count: number;
  resetAt: number;
}

/**
 * Read the effective throttle options of a handler.
 * - handler level options take precedence over class level options
 */
export function getThrottleOptions(cls: Constructor, field: SSKey): ThrottleOptions | undefined {
  return (
    getMethodMetadata<ThrottleOptions>(cls, field, THROTTLE_KEY) ?? getClassMetadata<ThrottleOptions>(cls, THROTTLE_KEY)
  );
}

function normalizeOptions(options: ThrottleInput): ThrottleOptions {
  expectObject<ThrottleOptions>(options, '@Throttle options must be an object');
  const { limit, ttl } = options;
  expect(
    typeof limit === 'number' && Number.isFinite(limit) && limit >= 0,
    `@Throttle limit must be a finite number greater than or equal to 0, got: ${String(limit)}`,
  );
  expect(
    typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0,
    `@Throttle ttl must be a finite number greater than 0, got: ${String(ttl)}`,
  );

  return { limit: Math.floor(limit), ttl: Math.floor(ttl) };
}

function getClientKey(request: FastifyRequest): string {
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

/**
 * Guard that enforces `@Throttle` metadata.
 *
 * - A guard instance is created per application, so counters never leak between apps
 * - Requests are counted per controller + handler + client IP
 * - Exceeding the limit throws `TooManyRequestsException` (429)
 * - `X-RateLimit-*` and `Retry-After` headers are set, same as NestJS throttler
 */
export class ThrottleGuard extends NestifyGuard {
  /** Route windows, keyed by the controller class then by `handler:client`. */
  private readonly windows = new WeakMap<object, Map<string, ThrottleWindow>>();

  /** `@Throttle` on both the class and the method adds this guard twice, count a request only once. */
  private readonly handled = new WeakSet<object>();

  canActivate(context: ExecutionContext): boolean {
    const options = getThrottleOptions(context.getClass(), context.getHandler().name as SSKey);

    // No decoration or throttling disabled
    if (!options || options.limit === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getReply<FastifyReply>();

    if (this.handled.has(request)) {
      return true;
    }
    this.handled.add(request);

    return this.consume(context.getClass(), context.getHandler().name as SSKey, request, reply, options);
  }

  private consume(
    cls: Constructor,
    field: SSKey,
    request: FastifyRequest,
    reply: FastifyReply,
    options: ThrottleOptions,
  ): boolean {
    const now = Date.now();
    const windows = this.getWindows(cls);
    const key = `${String(field)}:${getClientKey(request)}`;

    let window = windows.get(key);
    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + options.ttl };
      windows.set(key, window);

      if (windows.size > MAX_TRACKED_CLIENTS) {
        this.purgeExpired(windows, now);
      }
    }

    window.count++;

    const remaining = Math.max(0, options.limit - window.count);
    const retryAfter = Math.max(0, Math.ceil((window.resetAt - now) / 1000));

    reply
      .header('X-RateLimit-Limit', String(options.limit))
      .header('X-RateLimit-Remaining', String(remaining))
      .header('X-RateLimit-Reset', String(retryAfter));

    if (window.count > options.limit) {
      reply.header('Retry-After', String(retryAfter));
      throw new TooManyRequestsException();
    }

    return true;
  }

  private getWindows(cls: Constructor): Map<string, ThrottleWindow> {
    let windows = this.windows.get(cls);
    if (!windows) {
      windows = new Map();
      this.windows.set(cls, windows);
    }
    return windows;
  }

  private purgeExpired(windows: Map<string, ThrottleWindow>, now: number): void {
    for (const [key, window] of windows) {
      if (now >= window.resetAt) {
        windows.delete(key);
      }
    }
  }
}
_GuardSet(ThrottleGuard);

/**
 * Rate limit a controller or a handler.
 *
 * - Works like `@Throttle()` from `@nestjs/throttler`, but does not require a module import
 * - Can be used on a controller (all handlers) or on a single handler (overrides the controller)
 *
 * @example
 * ```typescript
 * @Controller('users')
 * @Throttle({ limit: 10, ttl: 60_000 })
 * class UserController {
 *   @Get()
 *   @Throttle({ default: { limit: 3, ttl: 60_000 } })
 *   list() {}
 * }
 * ```
 */
export function Throttle(options: ThrottleInput) {
  const normalized = normalizeOptions(options);
  const writeOptions = setThrottleOptions(normalized);

  return function (target: Constructor | AnyFunction, context: ClassDecoratorContext | ClassMethodDecoratorContext) {
    expectMiddleware([ThrottleGuard], target, context);

    writeOptions(target, context);
    metaSetUseGuards(context, [ThrottleGuard]);
  };
}
