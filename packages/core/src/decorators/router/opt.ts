import type { AnyFunction } from '@core/types/primitives.js';
import type { RouteOptType } from '@core/types/index.js';

import { expectObject, expectMethodDecorator } from '@core/asserts/index.js';
import { metaSetOpt } from '@core/register/meta.js';

/**
 * Set route options
 * @param opts Fastify's RouteShorthandOptions
 * Request schemas in `opts.schema` are rejected; use Nestify pipes instead.
 * `attachValidation` is ignored for Nestify routes.
 * @returns
 */
export function Opt<T extends RouteOptType>(opts: T) {
  return function (target: AnyFunction, context: ClassMethodDecoratorContext) {
    expectMethodDecorator(target, context);
    expectObject(opts, `Given opts must be a RouteShorthandOptions of Fastify`);
    metaSetOpt(context, opts);
  };
}
