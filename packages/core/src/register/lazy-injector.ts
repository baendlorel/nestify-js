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

export class Injector {
  /**
   * Which `instance[propertyKey]` is waiting for lazy injection of `dependency`
   */
  readonly injectList: LazyInjectEntry[] = [];

  /**
   * A map from token to the instance of Class
   */
  readonly instanceMap = new Map<SSKey, any>();

  getProvide(opts: ProviderOptions) {
    return _isConstructable(opts) ? opts.name : opts.provide;
  }

  get<T extends object>(token: InjectToken) {
    return this.instanceMap.get(_isKey(token) ? token : token.name) as T | undefined;
  }

  /**
   * Convert token array to a list of middleware hook functions
   * @param tokens
   * @param handlerName
   */
  getMiddlewareHooks<T extends NestifyMiddleware>(tokens: InjectToken[], handlerName: SSKey): AnyFunction[] {
    return tokens.map((token) => {
      const instance = this.get(_isKey(token) ? token : token.name);
      expectObject<T>(instance, `Cannot find class for token: ${String(token)}`);
      const handler = (instance as unknown as Record<SSKey, AnyFunction>)[handlerName];
      expectFunction(handler, `Handler '${String(handlerName)}' not found in ${String(token)}`);
      return (...args) => handler.apply(instance, args);
    });
  }

  getDetail<T extends object>(token: InjectToken): { instance: T; cls: Constructor | null } {
    const instance = this.instanceMap.get(_isKey(token) ? token : token.name) as T;
    const cls = (_getPrototypeOf(instance)?.constructor ?? null) as Constructor | null;
    return { instance, cls };
  }

  /**
   * This function do 2 things:
   * - Create an instance of `cls` directly, but without injections
   * - Record the token, injected field name and `injectArg` into a list
   *   - This list will be used by `apply` after all instances are created
   */
  createInstanceByClass(token: SSKey, cls: Constructor) {
    const { args } = metaGetProvider(cls);
    const instance = _construct(cls, args);
    this.instanceMap.set(token, instance);

    const injects = metaGetInject(cls);
    if (injects) {
      const propertyKeys = _ownKeys(injects);
      for (let i = 0; i < propertyKeys.length; i++) {
        const propertyKey = propertyKeys[i];
        this.injectList.push({
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

  createInstance(opts: ProviderOptions): InstanceType<Constructor> {
    const token = this.getProvide(opts);
    const exist = this.instanceMap.get(token);
    if (_isObject<InstanceType<Constructor>>(exist)) {
      return exist;
    }
    return ph.match(opts, {
      useClass: (token, cls) => {
        return this.createInstanceByClass(token, cls);
      },
      useValue: (token, value) => {
        this.instanceMap.set(token, value);
        return value;
      },
      // ! This means the injections must be created after instanceMap being filled up
      useFactory: (token, factory, inject) => {
        const instances = inject.map((arg) => this.instanceMap.get(_isKey(arg) ? arg : arg.name));
        const instance = factory(...instances);
        this.instanceMap.set(token, instance);
        return instance;
      },
      useExisting: (token, existingToken) => {
        const instance = this.instanceMap.get(existingToken);
        if (!_isObject(instance)) {
          _throw(`Cannot find existing provider: ${String(existingToken)}`);
        }
        this.instanceMap.set(token, instance);
        return instance;
      },
    });
  }

  /**
   * 1. Set `app.log` as `APP_LOGGER`
   * 2. Assign injected fields as `injectList` recorded
   * 3. Bind cron jobs for all instances
   */
  apply(app: NestifyInstance) {
    const map = this.instanceMap;
    // & Give default APP_LOGGER
    if (!map.has(APP_LOGGER)) {
      map.set(APP_LOGGER, app.log);
      app.collection.globalProviders.add(APP_LOGGER);
    }

    // & Inject instances
    for (let i = 0; i < this.injectList.length; i++) {
      const { provide, propertyKey, dependency } = this.injectList[i];
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

  checkMissedDependency() {
    for (let i = 0; i < this.injectList.length; i++) {
      const { provide, propertyKey, dependency } = this.injectList[i];
      const instance = this.instanceMap.get(provide);
      const name = ph.getInjectTokenName(dependency);
      expect(propertyKey in instance, `${String(provide)}[${String(propertyKey)}] depends on '${name}' but not given`);
    }
  }

  checkCircularDependency(rootModule: Constructor) {
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
  clear() {
    this.injectList.splice(0);
    this.instanceMap.clear();
  }
}
