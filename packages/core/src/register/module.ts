import type { NestifyInstance } from '@core/types/instance.js';
import type { NestifyOptions, DynamicModule, InheritedModuleMeta, ProviderOptions } from '@core/types/injection.js';
import { type Constructor, type SSKey } from '@nestify-js/shared';

import { toDynamicModule, toModuleClass } from '@core/common/index.js';
import { tryToGetGlobalToken } from '@core/common/inject-keys.js';

import { collection } from './collection.js';
import { expectAccessible, expectModule } from './expect-module.js';
import { injector } from './lazy-injector.js';
import { metaGetModule } from './meta.js';
import ph from './provider.js';
import { registerController } from './route/controller.js';

// TODO 这里要改为函数，不要类了

export function registerModule(app: NestifyInstance, opts: NestifyOptions) {
  // # init functions

  const moduleStack: Constructor[] = [];

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
      expectAccessible(providerOptions, m.accessibleProviderTokens);
      injector.createInstance(providerOptions);
    }

    // register routes
    for (let i = 0; i < m.controllers.length; i++) {
      const controller = m.controllers[i];
      expectAccessible(controller, m.accessibleProviderTokens);
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
  const collectGlobal = function (mod: Constructor | DynamicModule) {
    const { moduleClass, isGlobal } = toDynamicModule(mod);
    if (isGlobal) {
      const alreadAdded = collection.addGlobalModule(moduleClass);
      if (alreadAdded) {
        return; // already registered, prevent infinite loop
      }
    }

    const m = metaGetModule(moduleClass);
    for (let i = 0; i < m.imports.length; i++) {
      collectGlobal(m.imports[i]);
    }

    // & if global token is detected, add them to collection
    for (let i = 0; i < m.providers.length; i++) {
      const providerOptions = m.providers[i];
      const globalToken = tryToGetGlobalToken(providerOptions);
      if (globalToken) {
        // & this will automically detect global tokens and add them
        collection.addGlobalMiddleware(globalToken);
        injector.createInstance(providerOptions);
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
      injector.createInstance(opts.registerGlobalMiddlewares![i]);
    }

    const registerGlobal = (list: ProviderOptions[] | undefined, push: (token: SSKey) => void) => {
      for (let i = 0; i < (list ?? []).length; i++) {
        const providerOptions = list![i];
        injector.createInstance(providerOptions);
        push(ph.getToken(providerOptions));
      }
    };

    registerGlobal(opts.useGlobalGuards, (token) => collection.globalGuards.push(token));
    registerGlobal(opts.useGlobalInterceptors, (token) => collection.globalInterceptors.push(token));
    registerGlobal(opts.useGlobalFilters, (token) => collection.globalFilters.push(token));
    // pipes are stored as PipeOptions
    registerGlobal(opts.useGlobalPipes, (token) => collection.globalPipes.push({ pipe: token }));
  };

  collectGlobal(opts.rootModule);
  collection.assembleGlobalProviders();

  // prevent fastify to generate default validators
  const existedValidatorCompiler = app.validatorCompiler;
  app.setValidatorCompiler(() => () => true);

  // & Create instances of boot middlewares (registerGlobalMiddlewares + useGlobalXXX)
  registerBootMiddlewares(opts);

  // register every module recursively
  visit(opts.rootModule);

  injector.apply(app);

  // recover thie existed
  if (existedValidatorCompiler) {
    app.setValidatorCompiler(existedValidatorCompiler);
  }
}
