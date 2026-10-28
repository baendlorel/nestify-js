import { _fnToString, _isArray, _isConstructable, _isFunction, _isKey, _isObject } from '@nestify-js/shared';
import type { AnyFunction, Constructor } from '@core/types/primitives.js';
import {
  InjectToken,
  InjectArg,
  ProviderOptions,
  ProviderStandardOptions,
  ProviderUseClass,
  ProviderUseFactory,
  ProviderUseExisting,
} from '@core/types/injection.js';

import { metaGetModule } from '@core/register/meta.js';

/**
 * The goal is to tell whether the target is like `() => ProviderClass`
 * - Might be not so accurate under some extreme circumstances like bound functions or proxied functions, etc.
 *   - So we just don't allow such cases.
 * @see https://github.com/baendlorel/get-function-features
 * @see https://github.com/baendlorel/js-is-arrow-function
 */
export function isInjectedClassGetter(o: unknown): o is AnyFunction {
  if (typeof o !== 'function') {
    return false;
  }
  const str = _fnToString.call(o).replace(/\s/g, '');
  // Match '=>' not preceded by any quote character
  return str.startsWith('()=>');
}

/**
 * Roughly check if the target looks like a module
 * @param target
 * @returns
 */
export function likeModule(target: unknown): target is Constructor {
  if (!_isConstructable(target)) {
    return false;
  }
  const o = metaGetModule(target);
  if (!_isObject(o)) {
    return false;
  }

  const arr = [o.controllers, o.exports, o.providers, o.imports];
  if (arr.some((a) => !_isArray(a))) {
    return false;
  }
  return true;
}

/**
 * Check whether the target is a promise like(thenable) value
 */
export function isThenable(target: unknown): target is PromiseLike<unknown> {
  return typeof (target as { then?: unknown } | null | undefined)?.then === 'function';
}

export function isInjectToken(target: any): target is InjectToken {
  if (_isKey(target)) {
    return true;
  }

  if (_isConstructable(target)) {
    return true;
  }

  return false;
}

export function isInjectArg(target: any): target is InjectArg {
  if (_isKey(target)) {
    return true;
  }

  if (_isConstructable(target)) {
    return true;
  }

  if (_isFunction(target) && _isConstructable(target())) {
    return true;
  }

  return false;
}

export function isProviderOptions(target: unknown): target is ProviderOptions {
  // Class provider: direct class
  if (_isConstructable(target)) {
    return true;
  }
  // Object provider: must have provide key
  if (!_isObject<ProviderStandardOptions>(target)) {
    return false;
  }
  // FIXED 允许类作为 `provide`，与 token 身份化保持一致（类不再被转成类名字符串）。
  if (!isInjectToken(target.provide)) {
    return false;
  }

  if (_isConstructable((target as ProviderUseClass).useClass)) {
    return true;
  }

  if ('useValue' in target) {
    return true;
  }

  if (_isFunction((target as ProviderUseFactory).useFactory)) {
    return true;
  }

  // FIXED `useExisting` 同样支持类 token，保持别名按身份解析。
  if (isInjectToken((target as ProviderUseExisting).useExisting)) {
    return true;
  }

  // fallback: not a valid provider
  return false;
}
