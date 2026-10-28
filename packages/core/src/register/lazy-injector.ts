import type { LazyInjectEntry, ProviderOptions, InjectToken, DynamicModule } from '@core/types/injection.js';
import type { NestifyMiddleware } from '@core/types/middleware.js';
import type { AnyFunction, Constructor, SSKey } from '@core/types/primitives.js';
import type { NestifyInstance } from '@core/types/instance.js';

import { _construct, _getPrototypeOf, _isObject, _ownKeys, APP_LOGGER } from '@nestify-js/shared';

import { toModuleClass } from '@core/common/index.js';
import { expectFunction, expectObject, expect, isThenable } from '@core/asserts/index.js';
import { bindCronJob } from '@core/schedule/cron.js';

import { metaGetInject, metaGetModule } from './meta.js';
import ph from './provider.js';

export class Injector {
  /**
   * Which `instance[propertyKey]` is waiting for lazy injection of `dependency`
   */
  readonly injectList: LazyInjectEntry[] = [];

  /**
   * A map from token to the instance of Class
   * - Class providers are keyed by the constructor identity(like NestJS), not by class name
   */
  readonly instanceMap = new Map<InjectToken, any>();

  /**
   * Aliases declared by `useExisting` whose target was not created yet.
   * - resolved in `apply()` so the declaration order does not matter
   */
  readonly pendingAliases: { token: InjectToken; target: InjectToken }[] = [];

  getProvide(opts: ProviderOptions) {
    // FIXED 统一走 `ph.getToken`：类 provider 使用构造函数身份作为 token。
    return ph.getToken(opts);
  }

  /**
   * Get the instance registered under `token`.
   * - Passing a class infers the instance type from the constructor itself
   */
  // FIXED 查找统一按 token 身份（类 → 构造函数），并从构造函数推断返回类型。
  get<T extends object>(token: Constructor<T>): T | undefined;
  get<T extends object = object>(token: InjectToken): T | undefined;
  get(token: InjectToken): object | undefined {
    return this.instanceMap.get(ph.getInjectToken(token));
  }

  /**
   * Convert token array to a list of middleware hook functions
   * @param tokens
   * @param handlerName
   */
  getMiddlewareHooks<T extends NestifyMiddleware>(tokens: InjectToken[], handlerName: SSKey): AnyFunction[] {
    return tokens.map((token) => {
      const instance = this.get(token);
      expectObject<T>(instance, `Cannot find class for token: ${ph.getName(token)}`);
      const handler = (instance as unknown as Record<SSKey, AnyFunction>)[handlerName];
      expectFunction(handler, `Handler '${String(handlerName)}' not found in ${ph.getName(token)}`);
      return (...args) => handler.apply(instance, args);
    });
  }

  getDetail<T extends object>(token: InjectToken): { instance: T; cls: Constructor | null } {
    const instance = this.instanceMap.get(ph.getInjectToken(token)) as T;
    // FIXED token 未注册时不再对 undefined 调用 getPrototypeOf(会抛 TypeError)，交由调用方给出清晰错误。
    const cls = (_isObject(instance) ? _getPrototypeOf(instance)?.constructor : null) as Constructor | null;
    return { instance, cls };
  }

  /**
   * This function do 2 things:
   * - Create an instance of `cls` directly, but without injections
   * - Record the token, injected field name and `injectArg` into a list
   *   - This list will be used by `apply` after all instances are created
   */
  createInstanceByClass(token: InjectToken, cls: Constructor) {
    // FIXED 取消构造参数支持：provider 一律无参构造，需要预置参数时请使用 factory provider。
    const instance = _construct(cls, []);
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
    // FIXED 改用 `Map.has` 判断是否已注册，`useValue` 为 false / 0 / '' / null / undefined 时不会被重复创建。
    if (this.instanceMap.has(token)) {
      return this.instanceMap.get(token);
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
        // FIXED 依赖 token 统一归一化：类依赖以构造函数身份查找，不再按类名字符串查找。
        const instances = inject.map((arg) => this.instanceMap.get(ph.getInjectToken(arg)));
        const instance = factory(...instances);
        // FIXED 初始化流程是同步的，异步 factory 会让依赖方拿到 Promise；现在显式报错，不再静默注入错误类型。
        if (isThenable(instance)) {
          _throw(`Async factory for '${ph.getName(token)}' is not supported, providers must be created synchronously`);
        }
        this.instanceMap.set(token, instance);
        return instance;
      },
      useExisting: (token, existingToken) => {
        // FIXED 别名目标同样按 token 身份解析，避免 `useExisting` 退化成按类名匹配。
        const dependencyToken = ph.getInjectToken(existingToken);
        // FIXED 用 `Map.has` 判断目标是否存在，因此 useValue 的基本类型值也可以被别名引用。
        if (!this.instanceMap.has(dependencyToken)) {
          // FIXED 目标声明在同级数组靠后位置时不再立即报错，先登记，在 `apply` 中统一解析。
          this.pendingAliases.push({ token, target: dependencyToken });
          return undefined;
        }
        const instance = this.instanceMap.get(dependencyToken);
        this.instanceMap.set(token, instance);
        return instance;
      },
    });
  }

  /**
   * Resolve every alias registered by `useExisting`.
   * - Runs repeatedly so alias chains are resolved regardless of declaration order
   * - Throws when a target provider does not exist at all
   */
  private resolvePendingAliases() {
    let remaining = this.pendingAliases.splice(0, this.pendingAliases.length);
    let reordered: boolean;

    do {
      reordered = false;
      const next: typeof remaining = [];
      for (let i = 0; i < remaining.length; i++) {
        const { token, target } = remaining[i];
        if (this.instanceMap.has(target)) {
          this.instanceMap.set(token, this.instanceMap.get(target));
          reordered = true;
        } else {
          next.push(remaining[i]);
        }
      }
      remaining = next;
    } while (remaining.length > 0 && reordered);

    if (remaining.length > 0) {
      _throw(`Cannot find existing provider: ${ph.getName(remaining[0].target)}`);
    }
  }

  /**
   * 1. Set `app.log` as `APP_LOGGER`
   * 2. Assign injected fields as `injectList` recorded
   * 3. Bind cron jobs for all instances
   */
  apply(app: NestifyInstance) {
    const map = this.instanceMap;
    // FIXED 注入前先解析 `useExisting` 别名，声明顺序不再影响别名能否生效。
    this.resolvePendingAliases();
    // & Give default APP_LOGGER
    if (!map.has(APP_LOGGER)) {
      map.set(APP_LOGGER, app.log);
      app.collection.globalProviders.add(APP_LOGGER);
    }

    // & Inject instances
    for (let i = 0; i < this.injectList.length; i++) {
      const { provide, propertyKey, dependency } = this.injectList[i];
      const tokenOfDependency = ph.getInjectToken(dependency);

      expect(map.has(provide), `Provider '${ph.getName(provide)}' not found`);
      expect(
        map.has(tokenOfDependency),
        `Dependency '${ph.getName(tokenOfDependency)}' of a provider '${ph.getName(provide)}' not found. Maybe '${ph.getName(tokenOfDependency)}' is not decorated by @Injectable or something`,
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
      expect(
        propertyKey in instance,
        `${ph.getName(provide)}[${String(propertyKey)}] depends on '${name}' but not given`,
      );
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
