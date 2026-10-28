import type { AnyFunction, Constructor, OrPromise } from '@core/types/primitives.js';
import type { ExecutionContext } from '@core/common/execution-context.js';
import type { InjectToken } from '@core/types/injection.js';
import type { NestifyInterceptorLike, InterceptorNextHandlerLike } from '@core/types/middleware.js';
import { promiseTry, subclassOf } from '@nestify-js/shared';

import { expect } from '@core/asserts/index.js';
import { metaSetInterceptor, metaSetUseInterceptors } from '@core/register/meta.js';
import { _Injectable } from '../injectable.js';
import { expectMiddleware } from './expect-middleware.js';

/**
 * Outcome of one interceptor step
 * - `ok: true` carries the value that keeps flowing outward
 * - `ok: false` carries the error that must be handed to the next(outer) interceptor
 */
export type InterceptorOutcome = { ok: true; value: any } | { ok: false; error: unknown };

export class NestifyInterceptorNextHandler implements InterceptorNextHandlerLike {
  /**
   * @internal
   */
  private readonly queue: Array<{ type: 'map' | 'tap'; fn: (value: any) => any }> = [];

  /**
   * @internal
   */
  private readonly catchers: AnyFunction[] = [];

  /**
   * @internal
   * Run this interceptor over the outcome of the downstream chain
   * - Value: apply `map` / `tap`, a failure there is handled by its own `catch`
   * - Error: skip `map` / `tap` and give `catch` a chance to recover(like NestJS `catchError`)
   */
  async runOutcome(outcome: InterceptorOutcome): Promise<InterceptorOutcome> {
    if (!outcome.ok) {
      // FIXED 下游(控制器 / pipe / 内层拦截器)抛出的异常先交给本拦截器的 `catch`，与 NestJS 的 catchError 语义一致。
      return this.applyCatchers(outcome.error);
    }

    try {
      return { ok: true, value: await this.applyQueue(outcome.value) };
    } catch (e) {
      return this.applyCatchers(e);
    }
  }

  /**
   * @internal
   */
  async run(controllerResult: any) {
    const outcome = await this.runOutcome({ ok: true, value: controllerResult });
    if (!outcome.ok) {
      throw outcome.error;
    }
    return outcome.value;
  }

  private async applyQueue(value: any) {
    let current = value;
    for (let i = 0; i < this.queue.length; i++) {
      const v = this.queue[i];
      if (v.type === 'map') {
        current = await promiseTry(v.fn, null, current);
      } else if (v.type === 'tap') {
        await promiseTry(v.fn, null, current);
      }
    }
    return current;
  }

  /**
   * Try catchers in registration order, the first one that does not throw recovers the flow.
   */
  private async applyCatchers(error: unknown): Promise<InterceptorOutcome> {
    let currentError = error;
    for (let i = 0; i < this.catchers.length; i++) {
      try {
        return { ok: true, value: await promiseTry(this.catchers[i], null, currentError) };
      } catch (nextError) {
        currentError = nextError;
      }
    }
    return { ok: false, error: currentError };
  }

  /**
   * Register the controller result mapper.
   */
  map(fn: (value: any) => any): this {
    this.queue.push({ type: 'map', fn });
    return this;
  }

  /**
   * Run something with the controller result before it is returned. Usually used for logging.
   */
  tap(fn: (value: any) => void): this {
    this.queue.push({ type: 'tap', fn });
    return this;
  }

  /**
   * Register the error handler for this interceptor.
   * - If successfully catched and handled, the result will be passed to the next interceptor.
   * - If not handled or catcher function throws another error, the interception process will be stopped and enter the filter process.
   */
  catch(fn: (error: any) => any): this {
    this.catchers.push(fn);
    return this;
  }
}

/**
 * You must override the `intercept` method in your custom interceptor class.
 */
export class NestifyInterceptor implements NestifyInterceptorLike {
  /**
   * Called when entering the controller method
   * @param context like in NestJS, it can `.switchToHttp()` and get `request` and `reply` object
   * @returns returned function will be called when leaving the controller method
   */
  intercept(context: ExecutionContext, next: NestifyInterceptorNextHandler): OrPromise<NestifyInterceptorNextHandler>;
  intercept(_context: ExecutionContext, next: NestifyInterceptorNextHandler) {
    return next;
  }
}

/**
 * Use on services, configurations, etc.
 * - Decorated class must implement `NestifyInterceptor`
 */
export function Interceptor() {
  return function (target: Constructor, context: ClassDecoratorContext) {
    expect(subclassOf(target, NestifyInterceptor), '@Interceptor classes must extends NestifyInterceptor');

    // Same as Injectable, so it can be registered as a provider
    _Injectable(target, context);
    metaSetInterceptor(context);
  };
}

/**
 * Similar to Interceptors in NestJS but with different implementation
 * - Can be used on Controllers and Handlers in Controllers
 * - Interceptor is designed for http requests/replies, so it will not work on Injectables(Although there will not be any errors)
 */
export function UseInterceptors(...interceptors: InjectToken[]) {
  expect(interceptors.length > 0, '@UseInterceptors requires at least one interceptor');
  return function (target: Constructor | AnyFunction, context: ClassDecoratorContext | ClassMethodDecoratorContext) {
    expectMiddleware(interceptors, target, context);
    metaSetUseInterceptors(context, interceptors);
  };
}
