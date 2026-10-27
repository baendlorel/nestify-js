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

function concatRoute(...routes: string[][]): string {
  const flatRoutes = routes
    .flat()
    .map((r) => r.split('/'))
    .flat()
    .filter(Boolean);
  if (flatRoutes.length === 0) {
    return '/';
  }
  return '/' + flatRoutes.map((r) => `${r}/`).join('');
}

function getPipePart(pipeToken: unknown) {
  if (pipeToken === PipeBody || pipeToken === PipeBody.name) {
    return 'body';
  }
  if (pipeToken === PipeParams || pipeToken === PipeParams.name) {
    return 'params';
  }
  if (pipeToken === PipeQuery || pipeToken === PipeQuery.name) {
    return 'querystring';
  }
  return undefined;
}

const registeredControllers = new WeakMap<NestifyInstance, Set<Constructor>>();

export function registerController(app: NestifyInstance, controller: Constructor, modulePrefix: string[]) {
  if (!registeredControllers.has(app)) {
    registeredControllers.set(app, new Set());
  }
  const registered = registeredControllers.get(app)!;
  if (registered.has(controller)) {
    return;
  }
  registered.add(controller);

  const controllerPrefix = metaGetController(controller).prefix;
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
    const pipe = createPipe(app, getPipes(field));

    const firstMethodPipe = metaGetFirstMethodPipe(controller, field);
    const firstMethodPipeSchema = firstMethodPipe?.schema;
    opts.schema = toAssigned(opts.schema, ApiSchema, firstMethodPipeSchema); // Here schema is for swagger

    // FIXED 内置方法级管道的自定义校验延期到管道执行：既避免同一校验执行两次，
    // 也避免 Fastify 丢弃编译器返回的 false、0 等假值转换结果。
    // 调用方显式启用 attachValidation 时保留 Fastify 自行处理校验错误的行为。
    const originalCompiler = opts.validatorCompiler ?? app.validatorCompiler;

    const pipePart = getPipePart(firstMethodPipe?.pipe);

    const deferredValidationPart =
      originalCompiler && !opts.attachValidation && pipePart && firstMethodPipeSchema?.[pipePart] !== undefined
        ? pipePart
        : undefined;

    const validatorCompiler = deferredValidationPart
      ? (definition: Parameters<NonNullable<typeof originalCompiler>>[0]) => {
          // FIXED 仅跳过将由管道校验的同一个 schema；其他请求部分仍使用原编译器。
          if (
            definition.httpPart === deferredValidationPart &&
            definition.schema === firstMethodPipeSchema?.[deferredValidationPart]
          ) {
            return () => true;
          }
          const compiler = opts.validatorCompiler ?? app.validatorCompiler;
          if (!compiler) {
            throw new Error('Validator compiler is no longer available');
          }
          return compiler(definition);
        }
      : opts.validatorCompiler;

    // Pass the original method (with correct name) and instance for 'this' binding
    const handler = createHandler(
      controller,
      origin,
      { interceptor, guard, filter, pipe },
      opts.attachValidation === true,
      opts.validatorCompiler,
      deferredValidationPart,
    );

    console.log(`Registered - ${url} (${method.toUpperCase()})`);

    app.route({
      ...opts,
      method,
      url,
      handler,
      // FIXED 将 Fastify 校验错误附到请求，供后续 Nestify 流程处理。
      attachValidation: true,
      ...(validatorCompiler ? { validatorCompiler } : {}),
    });
  });
}
