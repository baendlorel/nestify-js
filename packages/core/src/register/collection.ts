import { type Constructor } from '@nestify-js/shared';
import type { InjectToken, ModuleMeta } from '@core/types/injection.js';
import type { PipeOptions } from '@core/types/middleware.js';

import { ReflectDeep } from 'reflect-deep';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE, APP_LOGGER, sym } from '@nestify-js/shared';

import { expect } from '@core/asserts/index.js';
import ph from './provider.js';

export class Collection {
  readonly globalModules = new Set<Constructor>();
  readonly globalProviders = new Set<InjectToken>();
  readonly globalInterceptors: InjectToken[] = [];
  readonly globalGuards: InjectToken[] = [];
  readonly globalFilters: InjectToken[] = [];
  readonly globalPipes: PipeOptions[] = [];

  /**
   * Add global middleware with specific token.
   * - do nothing if the token does not match
   * @param middleware tokens like `APP_FILTER`...
   * @returns
   */
  addGlobalMiddleware(middleware: InjectToken) {
    const name = ph.getName(middleware);
    switch (middleware) {
      case APP_FILTER:
        expect(this.globalFilters.length === 0, `${name} can only be registered once`);
        return this.globalFilters.push(APP_FILTER);
      case APP_GUARD:
        expect(this.globalGuards.length === 0, `${name} can only be registered once`);
        return this.globalGuards.push(APP_GUARD);
      case APP_INTERCEPTOR:
        expect(this.globalInterceptors.length === 0, `${name} can only be registered once`);
        return this.globalInterceptors.push(APP_INTERCEPTOR);
      case APP_PIPE:
        expect(this.globalPipes.length === 0, `${name} can only be registered once`);
        return this.globalPipes.push({ pipe: APP_PIPE });
      case APP_LOGGER:
        expect(!this.globalProviders.has(APP_LOGGER), `${name} can only be registered once`);
        return this.globalProviders.add(APP_LOGGER);
      default:
        break;
    }
  }

  /**
   * @returns whether this module is already added
   */
  addGlobalModule(moduleClass: Constructor): boolean {
    if (this.globalModules.has(moduleClass)) {
      return false;
    }
    this.globalModules.add(moduleClass);
    return true;
  }

  assembleGlobalProviders() {
    this.globalModules.forEach((m) => {
      const moduleMetadata = ReflectDeep.get(m, [sym.metadata, sym.root, sym.module]) as ModuleMeta;
      // FIXED 导出的 provider 统一归一化为 token（类 → 构造函数身份），与内部 token 使用同一身份。
      moduleMetadata.exports.forEach((exported) => this.globalProviders.add(ph.getToken(exported)));
    });
    [...this.globalFilters, ...this.globalGuards, ...this.globalInterceptors].forEach((token) =>
      this.globalProviders.add(token),
    );

    // Always has the APP_LOGGER
    // Default value is fastifyInstance.log
    this.globalProviders.add(APP_LOGGER);
  }

  /**
   * When registration is done, clears:
   * - globalProviders
   * - globalModules
   * - metadata(exclude sym.Custom) of Nestify Classes
   */
  clear() {
    this.globalProviders.clear();
    this.globalModules.clear();
    this.globalInterceptors.length = 0;
    this.globalGuards.length = 0;
    this.globalFilters.length = 0;
    this.globalPipes.length = 0;
  }
}
