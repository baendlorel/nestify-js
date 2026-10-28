import type { NestifyInstance } from '@core/types/instance.js';
import { type Constructor } from '@nestify-js/shared';
import { _define, _values, sym, toAssigned } from '@nestify-js/shared';

import {
  metaGetController,
  metaGetFirstMethodPipe,
  metaGetRoute,
  metaGetUseFilters,
  metaGetUseGuards,
  metaGetUseInterceptors,
  metaGetUsePipes,
} from '../meta.js';

// middlewares
import { createHandler } from './handler.js';
import { createGuard } from './middlewares/guard.js';
import { createFilter } from './middlewares/filter.js';
import { createPipe } from './middlewares/pipe.js';
import { createInterceptor } from './middlewares/interceptor.js';
import { PipeBody } from '@core/pipes/body.pipe.js';
import { PipeParams } from '@core/pipes/params.pipe.js';
import { PipeQuery } from '@core/pipes/query.pipe.js';
import { NestifyError } from '@core/asserts/error.js';
import type { PipeFullSchema, PipeOptions } from '@core/types/middleware.js';
import ph from '@core/register/provider.js';

function concatRoute(...routes: string[][]): string {
  const flatRoutes = routes
    .flat()
    .map((r) => r.split('/'))
    .flat()
    .filter(Boolean);
  if (flatRoutes.length === 0) {
    return '/';
  }
  // FIXED 注册标准的无尾斜杠 URL（根路由为 `/`）；尾斜杠差异由 router 统一忽略，避免出现只注册 `/a/b/` 的情况。
  return '/' + flatRoutes.join('/');
}

function getPipePart(app: NestifyInstance, pipeToken: PipeOptions['pipe']) {
  const instance = app.injector.get(pipeToken);
  if (instance instanceof PipeBody) {
    return 'body';
  }
  if (instance instanceof PipeParams) {
    return 'params';
  }
  if (instance instanceof PipeQuery) {
    return 'querystring';
  }
  return undefined;
}

const requestParts = ['body', 'params', 'querystring', 'headers'] as const;

function assertPipeSchemas(app: NestifyInstance, pipes: PipeOptions[], route: string) {
  for (const { pipe, schema } of pipes) {
    if (!schema) {
      continue;
    }
    const part = getPipePart(app, pipe);
    for (const key of requestParts) {
      if (schema[key] !== undefined && key !== part) {
        throw new NestifyError(
          `Route ${route}: schema.${key} is not validated by ${ph.getName(pipe)}; use the corresponding built-in pipe`,
        );
      }
    }
  }
}

function rejectRouteRequestSchemas(schema: PipeFullSchema | undefined, route: string) {
  if (!schema) {
    return;
  }
  for (const key of requestParts) {
    if (schema[key] !== undefined) {
      throw new NestifyError(`Route ${route}: schema.${key} in route options is not supported; use a Nestify pipe`);
    }
  }
}

const registeredControllers = new WeakMap<NestifyInstance, Map<Constructor, Set<string>>>();

export function registerController(app: NestifyInstance, controller: Constructor, modulePrefix: string[]) {
  let prefixes = registeredControllers.get(app);
  if (!prefixes) {
    prefixes = new Map();
    registeredControllers.set(app, prefixes);
  }

  let registeredPrefixes = prefixes.get(controller);
  if (!registeredPrefixes) {
    registeredPrefixes = new Set();
    prefixes.set(controller, registeredPrefixes);
  }

  // FIXED 去重键由「controller 类」改为「controller + 生效的路由前缀」：
  // 同一 controller 可以在多个模块(不同前缀)下各注册一次(与 NestJS 一致)，前缀相同仍只注册一次，避免路由重复注册。
  const controllerPrefix = metaGetController(controller).prefix;
  // ! Empty segments come from modules without a prefix, normalize them before comparing
  const prefixKey = concatRoute(modulePrefix, controllerPrefix, []);
  if (registeredPrefixes.has(prefixKey)) {
    return;
  }
  registeredPrefixes.add(prefixKey);

  const routes = metaGetRoute(controller);
  const instance = app.injector.createInstance(controller);

  // middlewares
  const getInterceptors = metaGetUseInterceptors(app, controller);
  const getGuards = metaGetUseGuards(app, controller);
  const getFilters = metaGetUseFilters(app, controller);
  const getPipes = metaGetUsePipes(app, controller);

  _values(routes).forEach((routeConfig) => {
    const { field, method, route } = routeConfig[sym.route.base];
    const url = concatRoute(modulePrefix, controllerPrefix, route);
    const opts = routeConfig[sym.route.opt] ?? {};
    const ApiSchema = routeConfig[sym.route.apiSchema]; // Schema info, includes `summary`, `description`, etc.

    // Get the original method from the instance
    const origin = (...args: any[]) => instance[field](...args);
    // & Must have same name as before, then metadata can be accessed correctly
    _define(origin, 'name', { value: field, configurable: true });

    const interceptor = createInterceptor(app, getInterceptors(field));
    const guard = createGuard(app, getGuards(field));
    const filter = createFilter(app, getFilters(field));
    const pipes = getPipes(field);
    assertPipeSchemas(app, pipes, url);
    rejectRouteRequestSchemas(opts.schema, url);
    rejectRouteRequestSchemas(ApiSchema, url);
    const pipe = createPipe(app, pipes);

    const firstMethodPipe = metaGetFirstMethodPipe(controller, field);
    const firstMethodPipeSchema = firstMethodPipe?.schema;
    const schema = toAssigned(opts.schema, ApiSchema, firstMethodPipeSchema);

    // Pass the original method (with correct name) and instance for 'this' binding
    const handler = createHandler(controller, origin, { interceptor, guard, filter, pipe }, opts.validatorCompiler);

    console.log(`Registered - ${url} (${method.toUpperCase()})`);

    const { attachValidation: _attachValidation, ...routeOptions } = opts;
    app.route({
      ...routeOptions,
      schema,
      method,
      url,
      handler,
      // FIXED 只对 Nestify 路由跳过 Fastify 请求校验，实际校验在管道执行。
      validatorCompiler: () => () => true,
    });
  });
}
