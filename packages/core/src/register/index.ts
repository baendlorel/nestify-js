import type { NestifyInstance } from '@core/types/instance.js';
import { NestifyOptions } from '@core/types/injection.js';

import { BuiltinMiddlewares } from '@core/setup.js';

import { clearExpectCache, expectModule } from './expect-module.js';
import moduleRegister from './module.js';

function clear() {
  clearExpectCache();
  // lazyInjector.clear();
  // collection.clear();
}

function normalize(opts: Partial<NestifyOptions>): NestifyOptions {
  const normalized: NestifyOptions = Object(opts);
  expectModule(normalized.rootModule);
  normalized.allowCrossModuleCircularReference ??= false;

  // defaults to empty arrays
  normalized.registerGlobalMiddlewares ??= [];
  normalized.useGlobalFilters ??= [];
  normalized.useGlobalPipes ??= [];
  normalized.useGlobalInterceptors ??= [];
  normalized.useGlobalGuards ??= [];

  // built-in pipes and guard are always registered, before user's ones
  normalized.registerGlobalMiddlewares = BuiltinMiddlewares.concat(normalized.registerGlobalMiddlewares);

  return normalized;
}

/**
 * Register every module of `rootModule` on an already-created instance.
 */
export async function apply(app: NestifyInstance, partialOpts: Partial<NestifyOptions>): Promise<void> {
  const opts = normalize(partialOpts);

  moduleRegister.apply(app, opts);

  clear();

  console.log(`Modules are all registered`);

  // Start cron jobs after all modules are initialized
  app.launchCronJobs();
}

export { nestify } from './nestify.js';
export type { NestifyBootOptions, NestifyPluginRegistration } from './nestify.js';
