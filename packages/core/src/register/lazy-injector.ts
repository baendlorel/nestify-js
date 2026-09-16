import type { LazyInjectEntry, ProviderOptions, InjectToken, DynamicModule } from '@core/types/injection.js';
import type { NestifyMiddleware } from '@core/types/middleware.js';
import type { AnyFunction, Constructor, SSKey } from '@core/types/primitives.js';
import type { NestifyInstance } from '@core/types/instance.js';

import {
  _construct,
  _getPrototypeOf,
  _isConstructable,
  _isKey,
  _isObject,
  _ownKeys,
  APP_LOGGER,
} from '@nestify-js/shared';

import { toModuleClass } from '@core/common/index.js';
import { expectFunction, expectObject, expect } from '@core/asserts/index.js';
import { bindCronJob } from '@core/schedule/cron.js';

import { metaGetInject, metaGetModule, metaGetProvider } from './meta.js';
import ph from './provider.js';
import { collection } from './collection.js';

export namespace injector {
  /**
   * Which `instance[propertyKey]` is waiting for lazy injection of `dependency`
   */
  const injectList: LazyInjectEntry[] = [];

  /**
   * A map from token to the instance of Class
   */
  const instanceMap = new Map<SSKey, any>();

  function getProvide(opts: ProviderOptions) {
    return _isConstructable(opts) ? opts.name : opts.provide;
  }

  export function get<T extends object>(token: InjectToken) {
    return instanceMap.get(_isKey(token) ? token : token.name) as T | undefined;
  }

  /**
   * Convert token array to a list of middleware hook functions
   * @param tokens
   * @param handlerName
   */
  export function getMiddlewareHooks<T extends NestifyMiddleware>(
    tokens: InjectToken[],
    handlerName: SSKey,
  ): AnyFunction[] {
    return tokens.map((token) => {
      const instance = get(_isKey(token) ? token : token.name);
      expectObject<T>(instance, `Cannot find class for token: ${String(token)}`);
      const handler = (instance as unknown as Record<SSKey, AnyFunction>)[handlerName];
      expectFunction(handler, `Handler '${String(handlerName)}' not found in ${String(token)}`);
      return (...args) => handler.apply(instance, args);
    });
  }

  export function getDetail<T extends object>(token: InjectToken): { instance: T; cls: Constructor | null } {
    const instance = instanceMap.get(_isKey(token) ? token : token.name) as T;
    const cls = (_getPrototypeOf(instance)?.constructor ?? null) as Constructor | null;
    return { instance, cls };
  }

  /**
   * This function do 2 things:
   * - Create an instance of `cls` directly, but without injections
   * - Record the token, injected field name and `injectArg` into a list
   *   - This list will be used by `apply` after all instances are created
   */
  export function createInstanceByClass(token: SSKey, cls: Constructor) {
    const { args } = metaGetProvider(cls);
    const instance = _construct(cls, args);
    instanceMap.set(token, instance);

    const injects = metaGetInject(cls);
    if (injects) {
      const propertyKeys = _ownKeys(injects);
      for (let i = 0; i < propertyKeys.length; i++) {
        const propertyKey = propertyKeys[i];
        injectList.push({
          provide: token,
          propertyKey,
          dependency: injects[propertyKey].dependency,
        });
      }
    }

    // We do not care about whether the provider is global or not
    // Because we already asserted this in `registerModule` of register.ts
    return instance;
  }

  export function createInstance(opts: ProviderOptions): InstanceType<Constructor> {
    const token = getProvide(opts);
    const exist = instanceMap.get(token);
    if (_isObject<InstanceType<Constructor>>(exist)) {
      return exist;
    }
    return ph.match(opts, {
      useClass: (token, cls) => {
        return createInstanceByClass(token, cls);
      },
      useValue: (token, value) => {
        instanceMap.set(token, value);
        return value;
      },
      // ! This means the injections must be created after instanceMap being filled up
      useFactory: (token, factory, inject) => {
        const instances = inject.map((arg) => instanceMap.get(_isKey(arg) ? arg : arg.name));
        const instance = factory(...instances);
        instanceMap.set(token, instance);
        return instance;
      },
      useExisting: (token, existingToken) => {
        const instance = instanceMap.get(existingToken);
        if (!_isObject(instance)) {
          _throw(`Cannot find existing provider: ${String(existingToken)}`);
        }
        instanceMap.set(token, instance);
        return instance;
      },
    });
  }

  /**
   * 1. Set `app.log` as `APP_LOGGER`
   * 2. Assign injected fields as `injectList` recorded
   * 3. Bind cron jobs for all instances
   */
  export function apply(app: NestifyInstance) {
    const map = instanceMap;
    // & Give default APP_LOGGER
    if (!map.has(APP_LOGGER)) {
      map.set(APP_LOGGER, app.log);
      collection.globalProviders.add(APP_LOGGER);
    }

    // & Inject instances
    for (let i = 0; i < injectList.length; i++) {
      const { provide, propertyKey, dependency } = injectList[i];
      const tokenOfDependency = ph.getInjectToken(dependency);

      expect(map.has(provide), `Provider '${String(provide)}' not found`);
      expect(
        map.has(tokenOfDependency),
        `Dependency '${String(tokenOfDependency)}' of a provider '${String(provide)}' not found. Maybe '${String(tokenOfDependency)}' is not decorated by @Injectable or something`,
      );

      const instance = map.get(provide);
      // deal key/class/()=>class
      instance[propertyKey] = map.get(tokenOfDependency);
    }

    // & Bind cron jobs for all instances
    for (const instance of map.values()) {
      if (_isObject(instance)) {
        const cls = _getPrototypeOf(instance)?.constructor as Constructor | undefined;
        if (cls) {
          bindCronJob(app, instance, cls);
        }
      }
    }
  }

  export function checkMissedDependency() {
    for (let i = 0; i < injectList.length; i++) {
      const { provide, propertyKey, dependency } = injectList[i];
      const instance = instanceMap.get(provide);
      const name = ph.getInjectTokenName(dependency);
      expect(propertyKey in instance, `${String(provide)}[${String(propertyKey)}] depends on '${name}' but not given`);
    }
  }

  export function checkCircularDependency(rootModule: Constructor) {
    const stack: Constructor[] = [];

    const visit = (m: Constructor | DynamicModule) => {
      const moduleClass = toModuleClass(m);
      if (stack.includes(moduleClass)) {
        const chain = stack.map((s) => s.name).join(' -> ');
        _throw(`Circular dependency detected: ${chain} -> ${String(moduleClass.name)}`);
      }
      stack.push(moduleClass);
      const moduleMetadata = metaGetModule(moduleClass);
      moduleMetadata.imports.forEach(visit);
      stack.pop();
    };

    visit(rootModule);
  }

  /**
   * When the lazy injection is done, clears:
   * - instanceMap
   * - injectList
   */
  export function clear() {
    injectList.splice(0);
    instanceMap.clear();
  }
}
