import { type Constructor, type SSKey } from '@nestify-js/shared';
import type { RouteBasic, RouteConfig, RouteOptType } from '@core/types/index.js';
import type {
  ProviderMeta,
  ControllerMeta,
  InjectArg,
  InjectMetadata,
  ModuleMeta,
  DynamicModule,
  ProviderOptions,
  InjectToken,
} from '@core/types/injection.js';
import type {
  RouteApiSchema,
  InterceptorGetter,
  GuardGetter,
  FilterGetter,
  PipeOptions,
  PipeGetter,
  PipeFullSchema,
} from '@core/types/middleware.js';

import { ReflectDeep } from 'reflect-deep';
import { concatArr, sym } from '@nestify-js/shared';
import { splitPath, toModuleClass } from '@core/common/utils.js';
import ph from './provider.js';
import { NestifyInstance } from '@core/types/instance.js';

/**
 * ! Methods here should be used **AFTER** validation of parameters
 */
/**
 * Directly set metadata on the context
 */
export function metaSet<T = unknown>(context: DecoratorContext, keys: SSKey[], value: T) {
  return ReflectDeep.set<T>(context.metadata, [sym.root, ...keys], value);
}

/**
 * Directly get metadata on the context
 */
export function metaGet<T = unknown>(cls: Constructor, keys: SSKey[]) {
  return ReflectDeep.get<T>(cls, [sym.metadata, sym.root, ...keys]);
}

export function metaSetController(context: ClassDecoratorContext, prefix?: string): boolean {
  const data: ProviderMeta = { args: [] };
  const controlled: ControllerMeta = { prefix: splitPath(prefix) };
  return metaSet(context, [sym.provider], data) && metaSet(context, [sym.controller], controlled);
}

export function metaGetController(cls: Constructor): ControllerMeta {
  return metaGet(cls, [sym.controller]) as ControllerMeta;
}

/**
 * Metadata is stored at: `class[sym.metadata][sym.root][sym.route][context.name][sym.route.base]`
 */
export function metaSetRoute(context: ClassMethodDecoratorContext, httpMethod: string, route?: string): boolean {
  const basic: RouteBasic = {
    method: httpMethod,
    route: splitPath(route),
    field: context.name,
  };
  return metaSet(context, [sym.route.root, context.name, sym.route.base], basic);
}

export function metaGetRoute(cls: Constructor): Record<SSKey, RouteConfig> {
  return metaGet(cls, [sym.route.root]) as Record<SSKey, RouteConfig>;
}

/**
 * Metadata is stored at: `class[sym.metadata][sym.root][sym.route][context.name][sym.route.opt]`
 */
export function metaSetOpt(context: ClassMethodDecoratorContext, opts: RouteOptType): boolean {
  return metaSet(context, [sym.route.root, context.name, sym.route.opt], opts);
}

/**
 * Metadata is stored at: `class[sym.metadata][sym.root][sym.route][context.name][sym.route.apiSchema]`
 */
export function metaSetSchema(context: ClassMethodDecoratorContext, schema: RouteApiSchema): boolean {
  return metaSet(context, [sym.route.root, context.name, sym.route.apiSchema], schema);
}

/**
 * Metadata is stored at: `class[sym.metadata][sym.root][sym.route][context.name][sym.route.args]`
 */
export function metaSetHandlerArgs(context: ClassMethodDecoratorContext, propertyPaths: string[][]) {
  return metaSet(context, [sym.route.root, context.name, sym.route.args], propertyPaths);
}

/**
 * Metadata is stored at: `class[sym.metadata][sym.root][sym.injection][context.name]`
 */
export function metaSetInject(context: ClassFieldDecoratorContext, dependency: InjectArg): boolean {
  const o: InjectMetadata = {
    dependency,
  };
  return metaSet(context, [sym.injection, context.name], o);
}

export function metaGetInject(cls: Constructor): Record<SSKey, InjectMetadata> | undefined {
  return metaGet<Record<SSKey, InjectMetadata>>(cls, [sym.injection]);
}

/**
 * Metadata is stored at: `class[sym.metadata][sym.root][sym.provider]`
 */
export function metaSetProvider(context: ClassDecoratorContext, args: unknown[] = []): boolean {
  const data: ProviderMeta = { args };
  return metaSet(context, [sym.provider], data);
}

/**
 * Directly set metadata on a class, used for `toModule(...)`
 *
 * Metadata is stored at: `class[sym.metadata][sym.root][sym.provider]`
 */
export function metaSetProviderOnClass(target: Constructor, args: unknown[] = []): boolean {
  const data: ProviderMeta = { args };
  return ReflectDeep.set(target, [sym.metadata, sym.root, sym.provider], data);
}

export function metaGetProvider(cls: Constructor): ProviderMeta {
  return metaGet(cls, [sym.provider]) as ProviderMeta;
}

/**
 * Metadata is stored at: `class[sym.metadata][sym.root][sym.module]`
 * - Will deduplicate each array automatically
 *
 * **normalize in the set method but not in get, makes it easier to detect bugs**
 * - some errors might be hidden when returning empty normalized metadata in get.
 */
export function metaSetModule(context: ClassDecoratorContext, options: Partial<ModuleMeta>): boolean {
  const { controllers = [], providers = [], imports = [], exports = [], outer = false, prefix = '' } = options;

  // TODO 这里metasetmodule需要有app实例，让它能注册到globalProviders
  return metaSet<ModuleMeta>(context, [sym.module], {
    controllers: [...new Set(controllers)],
    providers: [...new Set(providers)],
    imports: [...new Set(imports)],
    exports: [...new Set(exports)],
    getAccessibleProviderTokens(app: NestifyInstance) {
      const imported: SSKey[] = imports
        .map((m: Constructor | DynamicModule) => {
          const moduleClass = toModuleClass(m);
          return metaGetModule(moduleClass).exports.map((e) => e.name);
        })
        .flat();
      const providerTokens: SSKey[] = providers.map((p: ProviderOptions) => ph.getToken(p));
      return [...providerTokens, ...imported, ...app.collection.globalProviders];
    },
    outer,
    prefix,
  });
}

export function metaGetModule(cls: Constructor): ModuleMeta {
  return metaGet(cls, [sym.module]) as ModuleMeta;
}

// #region middlewares

export function metaSetInterceptor(context: ClassDecoratorContext) {
  return metaSet(context, [sym.interceptor.root], true);
}

export function metaIsInterceptor(cls: Constructor): boolean {
  return Boolean(metaGet(cls, [sym.interceptor.root]));
}

export function metaSetGuard(context: ClassDecoratorContext) {
  return metaSet(context, [sym.guard.root], true);
}

export function metaIsGuard(cls: Constructor): boolean {
  return Boolean(metaGet(cls, [sym.guard.root]));
}

export function metaSetFilters(context: ClassDecoratorContext, exceptionClasses: Constructor[]): boolean {
  return metaSet(context, [sym.filter.root], exceptionClasses);
}

export function metaGetFilters(cls: Constructor): Constructor[] | undefined {
  return metaGet(cls, [sym.filter.root]);
}

export function metaSetPipe(context: ClassDecoratorContext): boolean {
  return metaSet(context, [sym.pipe.root], true);
}

export function metaIsPipe(cls: Constructor): boolean {
  return Boolean(metaGet(cls, [sym.pipe.root]));
}
// #endregion

// #region set/get+UseMiddlewares series
/**
 * Metadata is stored at: `class[sym.metadata][sym.root][sym.interceptor]`
 * - Class level and method level will be stored in different symbols
 */
export function metaSetUseInterceptors(
  context: ClassDecoratorContext | ClassMethodDecoratorContext,
  tokens: InjectToken[],
): boolean {
  if (context.kind === 'class') {
    return metaSet(context, [sym.interceptor.controller], tokens);
  }

  return metaSet(context, [sym.interceptor.handler, context.name], tokens);
}

export function metaGetUseInterceptors(app: NestifyInstance, cls: Constructor): InterceptorGetter {
  const controller = metaGet<InjectToken[]>(cls, [sym.interceptor.controller]);
  const handler = metaGet<Record<SSKey, InjectToken[]>>(cls, [sym.interceptor.handler]) ?? {};
  return function (field: SSKey) {
    return concatArr(app.collection.globalInterceptors, controller, handler[field]);
  };
}

export function metaSetUseGuards(
  context: ClassDecoratorContext | ClassMethodDecoratorContext,
  tokens: InjectToken[],
): boolean {
  if (context.kind === 'class') {
    return metaSet(context, [sym.guard.controller], tokens);
  }
  return metaSet(context, [sym.guard.handler, context.name], tokens);
}

export function metaGetUseGuards(app: NestifyInstance, cls: Constructor): GuardGetter {
  const controller = metaGet<InjectToken[]>(cls, [sym.guard.controller]);
  const handler = metaGet<Record<SSKey, InjectToken[]>>(cls, [sym.guard.handler]) ?? {};
  return function (field: SSKey) {
    return concatArr(app.collection.globalGuards, controller, handler[field]);
  };
}

export function metaSetUseFilters(
  context: ClassDecoratorContext | ClassMethodDecoratorContext,
  tokens: InjectToken[],
): boolean {
  if (context.kind === 'class') {
    return metaSet(context, [sym.filter.controller], tokens);
  }
  return metaSet(context, [sym.filter.handler, context.name], tokens);
}

export function metaGetUseFilters(app: NestifyInstance, cls: Constructor): FilterGetter {
  const controller = metaGet<InjectToken[]>(cls, [sym.filter.controller]);
  const handler = metaGet<Record<SSKey, InjectToken[]>>(cls, [sym.filter.handler]) ?? {};
  return function (field: SSKey) {
    return concatArr(app.collection.globalFilters, controller, handler[field]);
  };
}

export function metaSetUsePipes(
  context: ClassDecoratorContext | ClassMethodDecoratorContext,
  pipes: PipeOptions[],
): boolean {
  if (context.kind === 'class') {
    return metaSet(context, [sym.pipe.controller], pipes);
  }
  return metaSet(context, [sym.pipe.handler, context.name], pipes);
}

export function metaGetUsePipes(app: NestifyInstance, cls: Constructor): PipeGetter {
  const controller = metaGet<PipeOptions[]>(cls, [sym.pipe.controller]);
  const handler = metaGet<Record<SSKey, PipeOptions[]>>(cls, [sym.pipe.handler]) ?? {};
  return function (field: SSKey) {
    return concatArr(app.collection.globalPipes, controller, handler[field]);
  };
}

/**
 * Fisrt method pipe is used to set schema for swagger
 */
export function metaGetFirstMethodPipeSchema(cls: Constructor, field: SSKey): PipeFullSchema | undefined {
  const methodPipes = metaGet<PipeOptions[]>(cls, [sym.pipe.handler, field]);
  if (!methodPipes) {
    // length > 0 is already assured by @UsePipes
    return undefined;
  }
  return methodPipes[0].schema;
}
// #endregion
