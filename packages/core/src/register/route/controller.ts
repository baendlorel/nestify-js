import type { NestifyInstance } from '@core/types/instance.js';
import { type Constructor } from '@nestify-js/shared';
import { _define, _values, sym, toAssigned } from '@nestify-js/shared';

import {
  metaGetController,
  metaGetFirstMethodPipeSchema,
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

export function registerController(app: NestifyInstance, controller: Constructor, modulePrefix: string[]) {
  const controllerPrefix = metaGetController(controller).prefix;
  const routes = metaGetRoute(controller);
  const instance = app.injector.createInstance(controller);

  // middlewares
  const getInterceptors = metaGetUseInterceptors(controller);
  const getGuards = metaGetUseGuards(controller);
  const getFilters = metaGetUseFilters(controller);
  const getPipes = metaGetUsePipes(controller);

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
    const guard = createGuard(getGuards(field));
    const filter = createFilter(getFilters(field));
    const pipe = createPipe(getPipes(field));
    const firstMethodPipeSchema = metaGetFirstMethodPipeSchema(controller, field);
    opts.schema = toAssigned(opts.schema, ApiSchema, firstMethodPipeSchema); // Here schema is for swagger

    // Pass the original method (with correct name) and instance for 'this' binding
    const handler = createHandler(controller, origin, { interceptor, guard, filter, pipe });

    console.log(`Registered - ${url} (${method.toUpperCase()})`);

    app.route({
      ...opts,
      method,
      url,
      handler,
    });
  });
}
