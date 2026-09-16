import type { ModuleMeta, DynamicModule } from '@core/types/injection.js';
import type { Constructor } from '@nestify-js/shared';
import type { NestifyInstance } from '@core/types/instance.js';

import { ReflectDeep } from 'reflect-deep';
import { sym } from '@nestify-js/shared';

import { createNamedClass } from '@core/common/utils.js';
import { expectClassNotDecorated, expectModulable } from '@core/asserts/index.js';
import { metaSetModule } from '@core/register/meta.js';
import { toInjectable } from './injectable.js';

/**
 * Use on modules.
 *
 * - Sandbox mechanic: Every decorated module class has its own space
 * - Modules can be global-scoped, which means once imported into any module.
 *   - Global modules must be placed in the root. Or the providers who uses it might not be able to access it.
 * - Modules can import other modules, but cannot export controllers.
 * - Modules can export providers, which can be injected into other modules.
 */
export function Module(options: Partial<ModuleMeta>) {
  return function (target: Constructor, context: ClassDecoratorContext) {
    expectModulable(target, context);
    metaSetModule(context, options);
  };
}

interface ToModuleOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[];
  isGlobal: boolean;
}

/**
 * Make outer provider an importable Nestify module
 * @param outerProvider
 */
export function toModule(outerProvider: Constructor, opt?: Partial<ToModuleOptions>): DynamicModule {
  const { isGlobal = false, args = [] } = Object(opt) as ToModuleOptions;
  expectClassNotDecorated(outerProvider, sym.provider);

  const injectable = toInjectable(outerProvider, args);
  // & Directly set everything in a temp class, not via `meta.setXXX`
  const temp = createNamedClass(`${outerProvider.name}Module`);
  ReflectDeep.set<ModuleMeta>(temp, [sym.metadata, sym.root, sym.module], {
    imports: [],
    providers: [injectable],
    controllers: [],
    exports: [injectable],
    getAccessibleProviderTokens(app: NestifyInstance) {
      return [...app.collection.globalProviders];
    },
    prefix: '',
    outer: true,
  });

  const dynamicModule: DynamicModule = {
    moduleClass: temp,
    isGlobal,
  };

  return dynamicModule;
}
