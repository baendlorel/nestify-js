/* eslint-disable @typescript-eslint/no-explicit-any */
import fastify, {
  type FastifyServerOptions,
  type FastifyPluginCallback,
  type FastifyPluginAsync,
  type FastifyPluginOptions,
  type FastifyListenOptions,
} from 'fastify';
import type { Constructor } from '@nestify-js/shared';
import type { NestifyOptions } from '@core/types/injection.js';
import type { NestifyInstance } from '@core/types/instance.js';

import { apply } from './index.js';
import { registerOpenApi } from './route/open-api.js';

/**
 * A fastify plugin to be registered before modules are applied.
 * - tuple form: `[plugin]` or `[plugin, options]`
 * - both callback-style and async-style plugins are accepted
 */
export type NestifyPluginRegistration = readonly [
  plugin: FastifyPluginCallback<any> | FastifyPluginAsync<any>,
  options?: FastifyPluginOptions,
];

export interface NestifyBootOptions extends Partial<Omit<NestifyOptions, 'rootModule'>> {
  /**
   * Shortcut for `fastify.logger`, identical in effect.
   */
  logger?: FastifyServerOptions['logger'];

  openApi?: Array<{ path: string; format: 'json' | 'yaml' }>;

  /**
   * Options passed to the fastify factory (`fastify(options)`)
   * - `routerOptions.ignoreTrailingSlash` is always forced to `true`
   */
  fastify?: FastifyServerOptions;

  /**
   * Fastify plugins registered before modules are applied
   * @example
   * ```typescript
   * plugins: [
   *   [multipart, { limits: { fileSize: 10 * 1024 * 1024 } }],
   *   [staticFiles, { root: './public', prefix: '/' }],
   * ]
   * ```
   */
  plugins?: readonly NestifyPluginRegistration[];

  /**
   * Start listening after all modules are registered.
   * - `true` to listen with defaults
   * - an object to override `port` / `host` etc.
   *
   * Defaults: `port` = `process.env.PORT` or `3000`, `host` = `process.env.HOST` or `'0.0.0.0'`
   *
   * @default undefined (do not listen; call `app.listen()` yourself)
   */
  listen?: boolean | Partial<FastifyListenOptions>;
}

/**
 * Create a fastify instance, register plugins, apply nestify modules
 * and (optionally) start listening — all in one call.
 *
 * @returns the underlying fastify instance (as `NestifyInstance`)
 * @example
 * ```typescript
 * const app = await nestify(AppModule, {
 *   logger: { level: 'info' },
 *   plugins: [[staticFiles, { root: './public', prefix: '/' }]],
 *   listen: true,
 * });
 * ```
 */
export async function nestify(rootModule: Constructor, opts: NestifyBootOptions = {}): Promise<NestifyInstance> {
  const { fastify: serverOptions = {}, plugins, listen, logger, openApi, ...rest } = opts;

  // `ignoreTrailingSlash` moved into `routerOptions` in fastify@5.
  // FIXED 尾斜杠一律忽略(NestJS 没有该开关)，不提供入参，也不允许通过 fastify 选项改回 strict。
  const { routerOptions, ...otherServerOptions } = serverOptions;
  const app = fastify({
    ...otherServerOptions,
    // `logger` is a shortcut for `fastify.logger`, written after the spread
    ...(logger === undefined ? {} : { logger }),
    routerOptions: {
      ...routerOptions,
      ignoreTrailingSlash: true,
    },
  }) as unknown as NestifyInstance;

  for (const [plugin, options] of plugins ?? []) {
    await app.register(plugin, options);
  }

  if (openApi) {
    await registerOpenApi(app, openApi);
  }

  await apply(app, { ...rest, rootModule });

  if (listen) {
    await app.listen({
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
      host: process.env.HOST || '0.0.0.0',
      ...(typeof listen === 'object' ? listen : undefined),
    });
  }

  return app;
}
