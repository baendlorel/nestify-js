import type { AnyFunction, Constructor, OrPromise } from '@core/types/primitives.js';
import type { ExecutionContext } from '@core/common/execution-context.js';
import type { InjectToken } from '@core/types/injection.js';
import type { NestifyInterceptorLike, InterceptorNextHandlerLike } from '@core/types/middleware.js';
import { promiseTry, subclassOf, sym } from '@nestify-js/shared';

import { expect } from '@core/asserts/index.js';
import { metaSetInterceptor, metaSetUseInterceptors } from '@core/register/meta.js';
import { _Injectable } from '../injectable.js';
import { expectMiddleware } from './expect-middleware.js';

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
   */
  async run(controllerResult: any) {
    let current = controllerResult;
    let currentError: any = sym.none;

    try {
      for (let i = 0; i < this.queue.length; i++) {
        const v = this.queue[i];
        if (v.type === 'map') {
          current = await promiseTry(v.fn, null, current);
        } else if (v.type === 'tap') {
          await promiseTry(v.fn, null, current);
        }
      }
    } catch (e) {
      currentError = e;
      for (let i = 0; i < this.catchers.length; i++) {
        try {
          current = await promiseTry(this.catchers[i], null, currentError);
          currentError = sym.none;
          break;
        } catch (nextError) {
          currentError = nextError;
        }
      }
    }

    if (currentError !== sym.none) {
      throw currentError;
    }
    return current;
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
