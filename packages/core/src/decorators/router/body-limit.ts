import type { AnyFunction } from '@core/types/primitives.js';

import { expect, expectMethodDecorator } from '@core/asserts/index.js';
import { metaSetBodyLimit } from '@core/register/meta.js';

/**
 * Set the maximum request body size(byte) of a single route.
 *
 * - Falls back to the Fastify server `bodyLimit` when not used
 * - Only affects this route, but it is applied by Fastify's content type parser,
 *   so an oversized body is rejected before any guard / pipe runs
 *
 * @example
 * ```typescript
 * @Post('/upload')
 * @BodyLimit(10 * 1024 * 1024) // 10MB
 * upload() {}
 * ```
 */
export function BodyLimit(bytes: number) {
  return function (target: AnyFunction, context: ClassMethodDecoratorContext) {
    expectMethodDecorator(target, context);
    expect(
      typeof bytes === 'number' && Number.isInteger(bytes) && bytes > 0,
      `@BodyLimit must be a positive integer(byte), got: ${String(bytes)}`,
    );

    metaSetBodyLimit(context, bytes);
  };
}
