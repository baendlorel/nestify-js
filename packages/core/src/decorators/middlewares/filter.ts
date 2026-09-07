import type { AnyFunction, Constructor, OrPromise } from '@core/types/primitives.js';
import type { ExecutionContext } from '@core/common/execution-context.js';
import type { InjectToken } from '@core/types/injection.js';
import type { NestifyFilterLike } from '@core/types/middleware.js';

import { subclassOf } from '@nestify-js/shared';
import { expect } from '@core/asserts/index.js';
import { metaSetFilters, metaSetUseFilters } from '@core/register/meta.js';

import { _Injectable } from '../injectable.js';
import { expectMiddleware } from './expect-middleware.js';

/**
 * You must override the `catch` method in your custom filter class.
 */
export class NestifyFilter implements NestifyFilterLike {
  /**
   * @param context like in NestJS, it can `.switchToHttp()` and get `request` and `reply` object
   * @param exception catched exception
   */
  catch(context: ExecutionContext, exception: unknown): OrPromise;
  catch(_context: ExecutionContext, _exception: unknown): OrPromise {}
}

/**
 * Set the exception classes to be caught by this filter.
 * - Decorated class must implement `NestifyFilter`
 * - If no exception classes are provided, it will catch all exceptions
 * @param exceptionClasses Classes of exceptions to be caught by this filter
 */
export function Filter(...exceptionClasses: Constructor[]) {
  return function (target: Constructor, context: ClassDecoratorContext) {
    expect(subclassOf(target, NestifyFilter), '@Filter classes must extends NestifyFilter');

    exceptionClasses.forEach((exceptionClass) => {
      const msg = `Error registered by @Filters must extend Error, got '${exceptionClass.name}'`;
      expect(subclassOf(exceptionClass, Error), msg);
    });

    // Same as Injectable, so it can be registered as a provider
    _Injectable(target, context);
    metaSetFilters(context, exceptionClasses);
  };
}

/**
 * Similar to Filters in NestJS but with different implementation
 * - Can be used on Controllers and Handlers in Controllers
 * - Filter is designed for http requests/replies, so it will not work on Injectables(Although there will not be any errors)
 */
export function UseFilters(...filters: InjectToken[]) {
  expect(filters.length > 0, '@UseFilters requires at least one filter');
  return function (target: Constructor | AnyFunction, context: ClassDecoratorContext | ClassMethodDecoratorContext) {
    expectMiddleware(filters, target, context);

    metaSetUseFilters(context, filters);
  };
}
