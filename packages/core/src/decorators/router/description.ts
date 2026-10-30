import type { AnyFunction } from '@core/types/primitives.js';
import type { RouteDescription } from '@core/types/index.js';

import { expectArray, expectMethodDecorator, expectObject, expectOrString } from '@core/asserts/index.js';
import { metaSetDescription } from '@core/register/meta.js';

const TAGS_MSG = '@Description tags must be an array of strings';

/**
 * Describe a route for OpenAPI/Swagger.
 *
 * - Only documentation: request validation belongs to the pipes
 * - The values are written into the route schema, so `@fastify/swagger` picks them up
 *
 * @example
 * ```typescript
 * @Get('/:id')
 * @Description({ summary: 'Get one user', description: 'Returns a single user', tags: ['users'] })
 * findOne() {}
 * ```
 */
export function Description(options: RouteDescription) {
  return function (target: AnyFunction, context: ClassMethodDecoratorContext) {
    expectMethodDecorator(target, context);
    expectObject<RouteDescription>(options, '@Description options must be an object');
    expectOrString(options.summary, '@Description summary must be a string or omitted');
    expectOrString(options.description, '@Description description must be a string or omitted');
    if (options.tags !== undefined) {
      expectArray<string>(options.tags, TAGS_MSG, (tag) => typeof tag === 'string' || TAGS_MSG);
    }

    // & Copy only the known keys, typos must never reach the OpenAPI document
    const normalized: RouteDescription = {};
    if (options.summary !== undefined) {
      normalized.summary = options.summary;
    }
    if (options.description !== undefined) {
      normalized.description = options.description;
    }
    if (options.tags !== undefined) {
      normalized.tags = [...options.tags];
    }

    metaSetDescription(context, normalized);
  };
}
