import type { AnyFunction, Constructor, OrPromise } from '@core/types/primitives.js';
import type { ExecutionContext } from '@core/common/execution-context.js';
import type { InjectToken } from '@core/types/injection.js';
import type { NestifyGuardLike } from '@core/types/middleware.js';
import { sym, subclassOf } from '@nestify-js/shared';

import { expect } from '@core/asserts/index.js';
import { metaSetGuard, metaSetProvider, metaSetUseGuards } from '@core/register/meta.js';
import { _Injectable } from '../injectable.js';
import { expectMiddleware } from './expect-middleware.js';

/**
 * You must override the `canActivate` method in your custom guard class.
 */
export class NestifyGuard implements NestifyGuardLike {
  /**
   * Guard
   * - you can use `throw` when guard fails
   * - will stop and reply if any guard returns `false` or throws an error
   * @param context like in NestJS, it can `.switchToHttp()` and get `request` and `reply` object
   * - if `previousReturn` is `undefined`, it will be ignored.
   */
  canActivate(context: ExecutionContext): OrPromise | OrPromise<boolean>;
  canActivate(_context: ExecutionContext): OrPromise | OrPromise<boolean> {}
}

/**
 * Use to define a Guard class
 * - Decorated class must implement `NestifyGuard`
 */
export function Guard() {
  return function (target: Constructor, context: ClassDecoratorContext) {
    expect(subclassOf(target, NestifyGuard), '@Guard classes must extends NestifyGuard');

    // Same as Injectable, so it can be registered as a provider
    _Injectable(target, context);
    metaSetGuard(context);
  };
}

export function _GuardSet(cls: Constructor) {
  const metadata = {};
  (cls as any)[sym.metadata] = metadata;
  const context = { kind: 'class' as const, name: cls.name, metadata, addInitializer: () => {} };
  metaSetProvider(context);
  metaSetGuard(context);
}

/**
 * Similar to Guards in NestJS but with different implementation
 * - Can be used on Controllers and Handlers in Controllers
 * - Guard is designed for http requests/replies, so it will not work on Injectables(Although there will not be any errors)
 */
export function UseGuards(...guards: InjectToken[]) {
  expect(guards.length > 0, '@UseGuards requires at least one guard');
  return function (target: Constructor | AnyFunction, context: ClassDecoratorContext | ClassMethodDecoratorContext) {
    expectMiddleware(guards, target, context);

    metaSetUseGuards(context, guards);
  };
}
