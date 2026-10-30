import type { InjectToken } from '@core/types/injection.js';
import type { AnyFunction, Constructor, SSKey } from '@core/types/primitives.js';

import { NestifyError } from './error.js';
import { _entries, _isArray, _isConstructable } from '@nestify-js/shared';

// # Basic
// TODO 改为标准throw NestifyError
export const expect: (target: any, msg: string) => asserts target = (target, msg) => {
  if (!target) {
    _throw(msg);
  }
};

export const expectOrString: (o: any, msg: string) => asserts o is string | undefined = (o, msg) => {
  if (o !== undefined && typeof o !== 'string') {
    _throw(msg);
  }
};

export const expectString: (o: any, msg: string) => asserts o is string = (o, msg) => {
  if (typeof o !== 'string') {
    _throw(msg);
  }
};

export const expectOrObject: (o: any, msg: string) => asserts o is object | undefined = (o, msg) => {
  if (o !== undefined && (typeof o !== 'object' || o === null)) {
    _throw(msg);
  }
};

export const expectObject: <T = object>(o: any, msg: string) => asserts o is T = (o, msg) => {
  if (typeof o !== 'object' || o === null) {
    _throw(msg);
  }
};

export const expectKey: (o: any, msg: string) => asserts o is InjectToken = (o, msg) => {
  if (typeof o !== 'string' && typeof o !== 'symbol' && !_isConstructable(o)) {
    _throw(msg);
  }
};

export const expectClass: (o: any, msg: string) => asserts o is Constructor = (o, msg) => {
  if (typeof o !== 'function') {
    _throw(msg);
  }

  try {
    const temp = new Proxy(o, { construct: () => ({}) });
    new temp();
  } catch {
    _throw(msg);
  }
};

export const expectBoolean: (o: any, msg: string) => asserts o is boolean = (o, msg) => {
  if (o !== true && o !== false) {
    _throw(msg);
  }
};

export const expectFunction: (o: any, msg: string) => asserts o is AnyFunction = (o, msg) => {
  if (typeof o !== 'function') {
    _throw(msg);
  }
};

export type ArrayPredicate<T> = (value: T, index: number, array: T[]) => void | string | boolean | null | undefined;

/**
 * Asserts that `arr` is an array.
 * - If `predicate` is provided, it will be called for each element in the array.
 *   - Throwing inside it propagates as-is
 *   - Returning a string throws an error with that message
 *   - Returning `false` throws an error with `msg`
 *   - Returning `true`, `null` or `undefined` marks the element as valid
 */
export const expectArray: <T = any>(arr: any, msg: string, predicate?: ArrayPredicate<T>) => asserts arr is T[] = (
  arr,
  msg,
  predicate,
) => {
  if (!_isArray(arr)) {
    throw new NestifyError(msg);
  }

  if (predicate) {
    for (let i = 0; i < arr.length; i++) {
      const result = predicate(arr[i], i, arr) as string | boolean | null | undefined;
      // FIXED 元素检查函数的返回值不再被忽略：返回字符串时用该信息报错，返回 false 时用外层 msg 报错。
      if (typeof result === 'string') {
        throw new NestifyError(result);
      }
      if (result === false) {
        throw new NestifyError(msg);
      }
    }
  }
};

export const expectRecord: <V>(
  target: unknown,
  predicate: (value: V, key?: SSKey) => void,
  msg: string,
) => asserts target is Record<SSKey, V> = (target, predicate, msg) => {
  expectObject(target, msg);
  for (const [key, value] of _entries(target)) {
    predicate(value, key);
  }
};
