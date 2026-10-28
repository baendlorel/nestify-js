import { describe, expect, it } from 'vitest';
import { Controller, HttpMethod, Module, nestify } from '@core/index.js';
import { metaGetRoute } from '@core/register/meta.js';
import { sym } from '@nestify-js/shared';

/**
 * `_throw` is a build-time macro that does not exist when sources run directly
 * under vitest, so mirror the build behavior for the error assertions below.
 */
(globalThis as unknown as { _throw?: (message: string) => never })._throw ??= (message) => {
  throw new Error(message);
};

@Controller()
class HeadController {
  @(HttpMethod('HEAD')('/head'))
  handle() {
    return { ok: true };
  }
}

@Module({ controllers: [HeadController] })
class AppModule {}

describe('HttpMethod', () => {
  it('validates the given method name', () => {
    expect(() => HttpMethod('')).toThrow("Invalid HTTP method: ''");
    expect(() => HttpMethod('GET PATH')).toThrow("Invalid HTTP method: 'GET PATH'");
    // @ts-expect-error non-string methods are rejected at runtime
    expect(() => HttpMethod(123)).toThrow('HTTP method must be a string');
  });

  it('always ignores trailing slashes, even when fastify options try to disable it', async () => {
    // FIXED 与 NestJS 一致：尾斜杠始终等价，不提供关闭入口。
    const options = { fastify: { routerOptions: { ignoreTrailingSlash: false } } };
    const app = await nestify(AppModule, options);
    try {
      expect((await app.inject({ method: 'HEAD', url: '/head' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'HEAD', url: '/head/' })).statusCode).toBe(200);
      expect(app.initialConfig.routerOptions?.ignoreTrailingSlash).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('returns a decorator factory that stores the custom method', () => {
    const route = metaGetRoute(HeadController).handle[sym.route.base];
    expect(route.method).toBe('HEAD');
    expect(route.route).toEqual(['head']);
  });

  it('registers a route for the custom method', async () => {
    const app = await nestify(AppModule);
    try {
      const response = await app.inject({ method: 'HEAD', url: '/head' });
      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
