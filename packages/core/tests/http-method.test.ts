import { describe, expect, it } from 'vitest';
import { Controller, HttpMethod, Module, nestify } from '@core/index.js';
import { metaGetRoute } from '@core/register/meta.js';
import { sym } from '@nestify-js/shared';

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
