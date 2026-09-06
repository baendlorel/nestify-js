import type { AnyFunction, Constructor, SSKey } from '@core/types/primitives.js';
import { sym } from '@nestify-js/shared';
import { expectDecoratorContext } from '@core/asserts/index.js';
import { metaGet, metaSet } from '@core/register/meta.js';

/**
 * Creates a custom decorator factory that stores metadata in the [sym.root, sym.custom] path
 * This metadata can be accessed in custom guards, interceptors, pipes, and filters
 *
 * @param key - The key to store the metadata under
 * @returns A decorator factory function that accepts metadata and returns a decorator
 */
export function createDecorator<T = unknown>(key: SSKey) {
  return function (metadata: T) {
    return function (_target: Constructor | AnyFunction, context: DecoratorContext) {
      expectDecoratorContext(context, `__func__ Invalid decorator context, got ${typeof context}`);

      if (context.kind === 'class') {
        metaSet<T>(context, [sym.custom.root, key], metadata);
      } else if (context.kind === 'method') {
        metaSet<T>(context, [sym.custom.root, sym.custom.method, context.name, key], metadata);
      } else {
        _throw(
          `Invalid decorator context for custom decorator with key "${String(key)}", must be class or method, got: ${context.kind}`,
        );
      }
    };
  };
}

/**
 * Retrieves class metadata
 */
export function getClassMetadata<T = unknown>(cls: Constructor, key: SSKey): T | undefined {
  return metaGet<T>(cls, [sym.custom.root, key]);
}

export function setClassMetadata<T = unknown>(context: ClassDecoratorContext, key: SSKey, metadata: T) {
  metaSet<T>(context, [sym.custom.root, key], metadata);
}

/**8-
 * Retrieves class method metadata
 */
export function getMethodMetadata<T = unknown>(
  cls: Constructor,
  methodName: string | symbol,
  key: SSKey,
): T | undefined {
  return metaGet<T>(cls, [sym.custom.root, sym.custom.method, methodName, key]);
}

/**
 * Set custom metadata for a class method.
 */
export function setMethodMetadata<T = unknown>(context: ClassMethodDecoratorContext, key: SSKey, metadata: T) {
  metaSet<T>(context, [sym.custom.root, sym.custom.method, context.name, key], metadata);
}
