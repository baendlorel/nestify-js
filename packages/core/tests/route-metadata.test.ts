import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { apply, Body, BodyLimit, Controller, Description, Module, Post, type NestifyInstance } from '@core/index.js';

/**
 * `_throw` is a build-time macro that does not exist when sources run directly
 * under vitest. The decoration error paths below rely on it.
 */
(globalThis as unknown as { _throw?: (message: string) => never })._throw ??= (message) => {
  throw new Error(message);
};

function createApp(options: Record<string, unknown> = {}) {
  return fastify(options) as unknown as NestifyInstance;
}

/** Record every `app.route()` call, so we can inspect the generated route schema */
function captureRoutes(app: NestifyInstance): any[] {
  const routes: any[] = [];
  const route = app.route.bind(app) as (opts: any) => unknown;
  (app as unknown as { route: (opts: any) => unknown }).route = (opts: any) => {
    routes.push(opts);
    return route(opts);
  };
  return routes;
}

describe('@BodyLimit', () => {
  it('limits the body of one route only', async () => {
    @Controller()
    class ControllerClass {
      @Post('small')
      @BodyLimit(8)
      small() {
        return { ok: true };
      }

      @Post('normal')
      normal() {
        return { ok: true };
      }
    }

    @Module({ controllers: [ControllerClass] })
    class App {}

    const app = createApp({ bodyLimit: 1024 });
    await apply(app, { rootModule: App });
    try {
      const payload = { data: 'x'.repeat(100) };
      expect((await app.inject({ method: 'POST', url: '/small', payload })).statusCode).toBe(413);
      expect((await app.inject({ method: 'POST', url: '/normal', payload })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('passes the limit to the route options', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      @BodyLimit(2048)
      handle() {
        return 'ok';
      }
    }

    @Module({ controllers: [ControllerClass] })
    class App {}

    const app = createApp();
    const routes = captureRoutes(app);
    await apply(app, { rootModule: App });
    try {
      expect(routes).toHaveLength(1);
      expect(routes[0].bodyLimit).toBe(2048);
    } finally {
      await app.close();
    }
  });

  it('rejects invalid values at decoration time', () => {
    expect(() => {
      class ControllerClass {
        @BodyLimit(0)
        handle() {}
      }
      return ControllerClass;
    }).toThrow(/@BodyLimit must be a positive integer/);

    expect(() => {
      class ControllerClass {
        @BodyLimit(1.5)
        handle() {}
      }
      return ControllerClass;
    }).toThrow(/@BodyLimit must be a positive integer/);
  });
});

describe('@Description', () => {
  it('writes summary, description and tags into the route schema', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      @Description({ summary: 'Create one', description: 'Creates a single user', tags: ['users', 'write'] })
      @Body({ type: 'object', required: ['name'] })
      create() {
        return 'ok';
      }
    }

    @Module({ controllers: [ControllerClass] })
    class App {}

    const app = createApp();
    const routes = captureRoutes(app);
    await apply(app, { rootModule: App });
    try {
      expect(routes[0].schema).toMatchObject({
        summary: 'Create one',
        description: 'Creates a single user',
        tags: ['users', 'write'],
        body: { type: 'object', required: ['name'] },
      });
    } finally {
      await app.close();
    }
  });

  it('works without any pipe schema', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      @Description({ summary: 'No body' })
      handle() {
        return 'ok';
      }
    }

    @Module({ controllers: [ControllerClass] })
    class App {}

    const app = createApp();
    const routes = captureRoutes(app);
    await apply(app, { rootModule: App });
    try {
      expect(routes[0].schema).toEqual({ summary: 'No body' });
    } finally {
      await app.close();
    }
  });

  it('drops unknown keys and rejects invalid values', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      // @ts-expect-error unknown keys are not part of RouteDescription
      @Description({ summary: 'ok', typo: 'gone' })
      handle() {
        return 'ok';
      }
    }

    @Module({ controllers: [ControllerClass] })
    class App {}

    const app = createApp();
    const routes = captureRoutes(app);
    await apply(app, { rootModule: App });
    try {
      expect(routes[0].schema).toEqual({ summary: 'ok' });
    } finally {
      await app.close();
    }

    expect(() => {
      class BadSummary {
        @Description({ summary: 1 as unknown as string })
        handle() {}
      }
      return BadSummary;
    }).toThrow(/@Description summary must be a string/);

    expect(() => {
      class BadTags {
        @Description({ tags: [1 as unknown as string] })
        handle() {}
      }
      return BadTags;
    }).toThrow(/@Description tags must be an array of strings/);

    expect(() => {
      class BadOptions {
        @Description(null as unknown as object)
        handle() {}
      }
      return BadOptions;
    }).toThrow(/@Description options must be an object/);
  });
});
