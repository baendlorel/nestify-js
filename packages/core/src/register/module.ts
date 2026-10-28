import type { NestifyInstance } from '@core/types/instance.js';
import type {
  NestifyOptions,
  DynamicModule,
  InheritedModuleMeta,
  InjectToken,
  ProviderOptions,
} from '@core/types/injection.js';
import { type Constructor } from '@nestify-js/shared';

import { toDynamicModule, toModuleClass } from '@core/common/index.js';
import { tryToGetGlobalToken } from '@core/common/inject-keys.js';

import { expectAccessible, expectModule } from './expect-module.js';
import { metaGetModule } from './meta.js';
import ph from './provider.js';
import { registerController } from './route/controller.js';
import { Collection } from './collection.js';
import { Injector } from './lazy-injector.js';

export function registerModule(app: NestifyInstance, opts: NestifyOptions) {
  const moduleStack: Constructor[] = [];

  app.injector = new Injector();
  app.collection = new Collection();
  app.onlyInternalServerError = opts.onlyInternalServerError;

  // #region init functions

  const visit = function (mod: Constructor | DynamicModule, inherited: InheritedModuleMeta = { prefix: [] }): void {
    const moduleClass = toModuleClass(mod);

    if (moduleStack.includes(moduleClass)) {
      const chain = moduleStack.map((m) => m.name).join(' -> ') + ` -> ${moduleClass.name}`;
      if (opts.allowCrossModuleCircularReference) {
        // if allowed, return directly since it is definitely registered before
        return;
      }
      _throw(`Circular dependency detected: ${chain}`);
    } else {
      moduleStack.push(moduleClass);
    }

    expectModule(moduleClass);

    // & When setting the module metadata, each array(providers, controllers, etc.)
    // & will all be set as an array
    const m = metaGetModule(moduleClass);
    const fullPrefix = [...inherited.prefix, m.prefix];

    // imports modules recursively
    // modules are no needed to be instantiated, we only cares about their metadata
    for (let i = 0; i < m.imports.length; i++) {
      visit(m.imports[i], { prefix: fullPrefix });
    }

    // & AccessibleProviders are from imported modules and itself
    for (let i = 0; i < m.providers.length; i++) {
      const providerOptions = m.providers[i];
      if (tryToGetGlobalToken(providerOptions)) {
        continue;
      }
      expectAccessible(providerOptions, m.getAccessibleProviderTokens(app));
      app.injector.createInstance(providerOptions);
    }

    // register routes
    for (let i = 0; i < m.controllers.length; i++) {
      const controller = m.controllers[i];
      expectAccessible(controller, m.getAccessibleProviderTokens(app));
      registerController(app, controller, fullPrefix);
    }

    // pop the module from stack after processing
    moduleStack.pop();
  };

  /**
   * Collect every global things into `collection`
   * - modules
   * - global provider tokens from 'inject-keys.ts'
   * @param mod
   */
  const collectGlobal = function (mod: Constructor | DynamicModule, visited = new Set<Constructor>()) {
    const { moduleClass, isGlobal } = toDynamicModule(mod);
    if (isGlobal) {
      app.collection.addGlobalModule(moduleClass);
    }

    if (visited.has(moduleClass)) {
      return;
    }
    visited.add(moduleClass);

    const m = metaGetModule(moduleClass);
    for (let i = 0; i < m.imports.length; i++) {
      collectGlobal(m.imports[i], visited);
    }

    // & if global token is detected, add them to collection
    for (let i = 0; i < m.providers.length; i++) {
      const providerOptions = m.providers[i];
      const globalToken = tryToGetGlobalToken(providerOptions);
      if (globalToken) {
        // & this will automically detect global tokens and add them
        app.collection.addGlobalMiddleware(globalToken);
        app.injector.createInstance(providerOptions);
      }
    }
  };

  /**
   * Create instances of middlewares passed via boot options.
   * - `registerGlobalMiddlewares`: only registered, no global effect
   * - `useGlobalXXX`: applied globally after `registerGlobalMiddlewares`,
   *   in their own array order
   */
  const registerBootMiddlewares = function (opts: NestifyOptions) {
    for (let i = 0; i < (opts.registerGlobalMiddlewares ?? []).length; i++) {
      app.injector.createInstance(opts.registerGlobalMiddlewares![i]);
    }

    const registerGlobal = (list: ProviderOptions[] | undefined, push: (token: InjectToken) => void) => {
      for (let i = 0; i < (list ?? []).length; i++) {
        const providerOptions = list![i];
        app.injector.createInstance(providerOptions);
        // FIXED 全局中间件 token 改用 `ph.getToken`（类 → 构造函数身份），不再退化为类名字符串。
        push(ph.getToken(providerOptions));
      }
    };

    registerGlobal(opts.useGlobalGuards, (token) => app.collection.globalGuards.push(token));
    registerGlobal(opts.useGlobalInterceptors, (token) => app.collection.globalInterceptors.push(token));
    registerGlobal(opts.useGlobalFilters, (token) => app.collection.globalFilters.push(token));
    // pipes are stored as PipeOptions
    registerGlobal(opts.useGlobalPipes, (token) => app.collection.globalPipes.push({ pipe: token }));
  };

  // #endregion

  collectGlobal(opts.rootModule);
  app.collection.assembleGlobalProviders();

  // FIXED 不再用恒成功的编译器覆盖应用配置：否则默认 schema 校验及后续 Fastify 路由都会失效。
  // & Create instances of boot middlewares (registerGlobalMiddlewares + useGlobalXXX)
  registerBootMiddlewares(opts);

  // register every module recursively
  visit(opts.rootModule);

  app.injector.apply(app);
}
