import { describe, expect, it } from 'vitest';
import { Controller, Get, Module, Throttle, nestify } from '@core/index.js';

/**
 * `_throw` is a build-time macro that does not exist when sources run directly
 * under vitest, so mirror the build behavior for the error assertions below.
 */
(globalThis as unknown as { _throw?: (message: string) => never })._throw ??= (message) => {
  throw new Error(message);
};

function createApp(controller: any) {
  @Module({ controllers: [controller] })
  class App {}
  return nestify(App);
}

describe('@Throttle', () => {
  it('blocks requests over the limit and sets rate limit headers', async () => {
    @Controller()
    class RateController {
      @Get('limited')
      @Throttle({ limit: 2, ttl: 60_000 })
      limited() {
        return 'ok';
      }
    }

    const app = await createApp(RateController);
    try {
      const first = await app.inject('/limited');
      expect(first.statusCode).toBe(200);
      expect(first.headers['x-ratelimit-limit']).toBe('2');
      expect(first.headers['x-ratelimit-remaining']).toBe('1');

      const second = await app.inject('/limited');
      expect(second.statusCode).toBe(200);
      expect(second.headers['x-ratelimit-remaining']).toBe('0');

      const third = await app.inject('/limited');
      expect(third.statusCode).toBe(429);
      expect(third.json().message).toBe('Too Many Requests');
      expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('uses handler options over controller options and does not count twice', async () => {
    @Controller()
    @Throttle({ limit: 5, ttl: 60_000 })
    class RateController {
      @Get('loose')
      loose() {
        return 'ok';
      }

      @Get('strict')
      @Throttle({ limit: 1, ttl: 60_000 })
      strict() {
        return 'ok';
      }
    }

    const app = await createApp(RateController);
    try {
      // Handler level limit (1) overrides the controller level limit (5),
      // and the request must only be counted once even though the guard is added twice.
      expect((await app.inject('/strict')).statusCode).toBe(200);
      expect((await app.inject('/strict')).statusCode).toBe(429);

      // Controller level limit applies to other handlers
      for (let i = 0; i < 5; i++) {
        expect((await app.inject('/loose')).statusCode).toBe(200);
      }
      expect((await app.inject('/loose')).statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });

  it('disables throttling when limit is 0', async () => {
    @Controller()
    class RateController {
      @Get('free')
      @Throttle({ limit: 0, ttl: 60_000 })
      free() {
        return 'ok';
      }
    }

    const app = await createApp(RateController);
    try {
      for (let i = 0; i < 5; i++) {
        expect((await app.inject('/free')).statusCode).toBe(200);
      }
    } finally {
      await app.close();
    }
  });

  it('rejects invalid options at decoration time', () => {
    expect(() => Throttle({ limit: -1, ttl: 60_000 })).toThrow(/limit/);
    expect(() => Throttle({ limit: 1, ttl: 0 })).toThrow(/ttl/);
  });
});
