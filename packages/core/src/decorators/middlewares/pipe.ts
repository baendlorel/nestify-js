import type { AnyFunction, Constructor, OrPromise } from '@core/types/primitives.js';
import type { ExecutionContext } from '@core/common/execution-context.js';
import type { NestifyPipeLike, PipeFullSchema, PipeOptions } from '@core/types/middleware.js';
import { subclassOf } from '@nestify-js/shared';

import { _isConstructable, _isKey, sym } from '@nestify-js/shared';

import { expectInjectToken, expectObject, expectOrObject, expect } from '@core/asserts/index.js';
import { metaSetPipe, metaIsPipe, metaSetUsePipes, metaSetProvider } from '@core/register/meta.js';

import { _Injectable } from '../injectable.js';
import { expectMiddleware } from './expect-middleware.js';

/**
 * You must override the `transform` method in your custom pipe class.
 */
export class NestifyPipe implements NestifyPipeLike {
  /**
   * Like transform in NestJS Pipe, validation and transformation are done here
   *
   * @param context like in NestJS, it can `.switchToHttp()` and get `request` and `reply` object
   * @param input comes from last pipe's return value, or `undefined` if it's the first
   * @param schema validation schema, if provided in the pipe options
   * @returns returned value will be passed to the next pipe. The last pipe's return value will be passed to the controller.
   */
  transform(context: ExecutionContext, input: any[], schema: PipeFullSchema): OrPromise<any[]>;
  transform(_context: ExecutionContext, input: any[], _schema: PipeFullSchema): OrPromise<any[]> {
    return input;
  }
}

/**
 * Create a Pipe class by decorate it.
 * - Decorated class must implement `NestifyPipe`
 * @returns
 */
export function Pipe() {
  return function (target: Constructor, context: ClassDecoratorContext) {
    expect(subclassOf(target, NestifyPipe), '@Pipe classes must extends NestifyPipe');
    // Same as Injectable, so it can be registered as a provider
    _Injectable(target, context);
    metaSetPipe(context);
  };
}

export function _PipeSet(cls: Constructor) {
  const metadata = {};
  (cls as any)[sym.metadata] = metadata;
  const context = { kind: 'class' as const, name: cls.name, metadata, addInitializer: () => {} };
  metaSetProvider(context);
  metaSetPipe(context);
}

function predicate(opts: PipeOptions) {
  expectObject(opts, 'Pipe options must be an object');
  const { schema, pipe } = opts;
  expectOrObject(schema, 'Pipe options.schema must be an object or omitted');
  expectInjectToken(pipe, 'Pipe options.pipe must be a string/symbol/class or omitted');
  const validPipe = (_isConstructable(pipe) && metaIsPipe(pipe)) || _isKey(pipe);
  expect(validPipe, 'Pipe options.pipe must be a string/symbol/PipeClass');
}

/**
 * Similar to Pipes in NestJS but with different implementation
 * - `fastify.setValidatorCompiler` will be used for validation
 * - Can be used on Controllers and Handlers in Controllers
 * - Pipe is designed for http requests/replies, so it will not work on Injectables(Although there will not be any errors)
 * @param pipes PipeOptions or PipeClass
 */
export function UsePipes(...pipes: (PipeOptions | Constructor)[]) {
  expect(pipes.length > 0, '@UsePipes requires at least one pipe option or pipe class');
  const normalized = pipes.map((pipe) => (_isConstructable(pipe) ? { pipe } : pipe));
  normalized.forEach(predicate);

  return function (target: Constructor | AnyFunction, context: ClassDecoratorContext | ClassMethodDecoratorContext) {
    expectMiddleware([], target, context);

    metaSetUsePipes(context, normalized);
  };
}
