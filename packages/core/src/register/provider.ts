import { NestifyError } from '@core/asserts/error.js';
import type {
  InjectArg,
  InjectToken,
  ProviderOptions,
  ProviderUseClass,
  ProviderUseValue,
  ProviderUseFactory,
  ProviderUseExisting,
} from '@core/types/injection.js';

import { inspect } from 'node:util';
import { _isConstructable, _isFunction, _isKey, type Constructor } from '@nestify-js/shared';
import { expectClass, expectFunction, expectKey } from '@core/asserts/index.js';

namespace ph {
  export function match(
    opts: ProviderOptions,
    callbacks: {
      useClass?: (token: InjectToken, cls: Constructor) => unknown;
      useValue?: (token: InjectToken, value: InstanceType<Constructor>) => unknown;
      useFactory?: (token: InjectToken, factory: (...instances: any[]) => any, inject: InjectToken[]) => unknown;
      useExisting?: (token: InjectToken, existingToken: InjectToken) => unknown;
    },
  ) {
    const { useClass, useExisting, useFactory, useValue } = callbacks;

    // Handle direct class provider
    if (_isConstructable(opts) && useClass) {
      // FIXED 类 provider 的 token 就是构造函数本身，不再退化成类名字符串，避免同名类互相覆盖。
      return useClass(opts, opts);
    }

    const optsStr = inspect(opts);

    // Check actual provider type and call corresponding callback
    if ('useClass' in opts && useClass) {
      opts = opts as ProviderUseClass;
      expectClass(opts.useClass, `ProviderOptions must have a valid useClass, got: ${optsStr}`);
      return useClass(opts.provide, opts.useClass);
    }

    if ('useValue' in opts && useValue) {
      opts = opts as ProviderUseValue;
      return useValue(opts.provide, opts.useValue);
    }

    if ('useFactory' in opts && useFactory) {
      opts = opts as ProviderUseFactory;
      expectFunction(opts.useFactory, `ProviderOptions must have a valid useFactory, got: ${optsStr}`);
      return useFactory(opts.provide, opts.useFactory, opts.inject ?? []);
    }

    if ('useExisting' in opts && useExisting) {
      opts = opts as ProviderUseExisting;
      expectKey(opts.useExisting, `ProviderOptions must have a valid useExisting, got: ${optsStr}`);
      return useExisting(opts.provide, opts.useExisting);
    }

    throw new NestifyError(
      `ProviderOptions must have one of useClass/useValue/useFactory/useExisting, got: ${optsStr}`,
    );
  }

  export function getToken(providerOptions: ProviderOptions): InjectToken {
    // FIXED 对齐 NestJS：类 provider 直接以构造函数作为 token；字符串 / symbol token 保持独立。
    const token = _isConstructable(providerOptions) ? providerOptions : providerOptions.provide;
    expectKey(token, `ProviderOptions must have a valid token, got '${String(token)}'`);
    return token;
  }

  /**
   * Human readable name of a token, only for error messages.
   * - Never use it as a lookup key, the token identity itself must be used.
   */
  export function getName(token: InjectToken): string {
    if (typeof token === 'string') {
      return token;
    }
    if (typeof token === 'symbol') {
      return token.description ?? String(token);
    }
    return token.name || 'anonymous class';
  }

  /**
   * Normalize the inject argument to a token.
   * @param arg InjectArg
   * @returns the token used by `lazyInjector.instanceMap`
   */
  export function getInjectToken(arg: InjectArg): InjectToken {
    if (_isKey(arg)) {
      return arg;
    }

    if (_isConstructable(arg)) {
      // FIXED 类依赖以构造函数身份作为 token，不再按类名查找。
      return arg;
    }

    if (_isFunction(arg)) {
      // FIXED 惰性引用(`() => Class`)同样解析为构造函数本身，保持与直接引用一致的身份。
      return arg();
    }

    throw new NestifyError('Cannot get inject token from argument: ' + String(arg));
  }

  export function getInjectTokenName(arg: InjectArg): string {
    return getName(getInjectToken(arg));
  }
}

export default ph;
