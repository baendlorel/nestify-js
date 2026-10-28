import { describe, expect, it } from 'vitest';
import {
  Controller,
  ExecutionContext,
  Get,
  Interceptor,
  Module,
  NestifyInterceptor,
  NestifyInterceptorNextHandler,
  NestifyPipe,
  Pipe,
  UseInterceptors,
  UsePipes,
  nestify,
} from '@core/index.js';

import { runReverseInterceptors } from '../src/register/route/middlewares/interceptor.js';

describe('NestifyInterceptorNextHandler', () => {
  it('can be returned through async code without being treated as a thenable', async () => {
    const next = new NestifyInterceptorNextHandler().map((value: number) => value + 1);

    expect('then' in next).toBe(false);
    await expect(Promise.resolve(next)).resolves.toBe(next);
    await expect(runReverseInterceptors([next], { ok: true, value: 1 })).resolves.toEqual({ ok: true, value: 2 });
  });

  it('keeps map and catch chainable', async () => {
    const next = new NestifyInterceptorNextHandler()
      .map(() => {
        throw new Error('failed');
      })
      .catch((error: Error) => error.message);

    await expect(runReverseInterceptors([next], { ok: true, value: null })).resolves.toEqual({
      ok: true,
      value: 'failed',
    });
  });

  it('keeps the error when no catcher recovers it', async () => {
    const next = new NestifyInterceptorNextHandler().catch(() => {
      throw new Error('again');
    });

    const outcome = await runReverseInterceptors([next], { ok: false, error: new Error('boom') });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? undefined : (outcome.error as Error).message).toBe('again');
  });
});

@Interceptor()
class Recover extends NestifyInterceptor {
  intercept(_context: ExecutionContext, next: NestifyInterceptorNextHandler) {
    return next.catch((error: Error) => ({ recovered: error.message }));
  }
}

@Pipe()
class ThrowingPipe extends NestifyPipe {
  transform(): any[] {
    throw new Error('pipe failed');
  }
}

@Controller()
@UseInterceptors(Recover)
class ThrowingController {
  @Get('boom')
  handle() {
    throw new Error('boom');
  }

  @Get('pipe')
  @UsePipes(ThrowingPipe)
  piped() {
    return { unreachable: true };
  }
}

@Module({ controllers: [ThrowingController], providers: [Recover, ThrowingPipe] })
class App {}

describe('interceptor catch on downstream errors', () => {
  it('recovers from a controller error', async () => {
    const app = await nestify(App);
    try {
      const response = await app.inject('/boom');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ recovered: 'boom' });
    } finally {
      await app.close();
    }
  });

  it('recovers from a pipe error', async () => {
    const app = await nestify(App);
    try {
      const response = await app.inject('/pipe');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ recovered: 'pipe failed' });
    } finally {
      await app.close();
    }
  });
});

describe('interceptor error propagation order', () => {
  it('applies outer map to a value recovered by an inner interceptor', async () => {
    @Interceptor()
    class Inner extends NestifyInterceptor {
      intercept(_context: ExecutionContext, next: NestifyInterceptorNextHandler) {
        return next.catch(() => 'recovered');
      }
    }
    @Interceptor()
    class Outer extends NestifyInterceptor {
      intercept(_context: ExecutionContext, next: NestifyInterceptorNextHandler) {
        return next.map((value: string) => `outer:${value}`);
      }
    }
    @Controller()
    @UseInterceptors(Outer, Inner)
    class ControllerClass {
      @Get()
      handle() {
        throw new Error('boom');
      }
    }
    @Module({ controllers: [ControllerClass], providers: [Outer, Inner] })
    class LocalApp {}
    const app = await nestify(LocalApp);
    try {
      const response = await app.inject('/');
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('outer:recovered');
    } finally {
      await app.close();
    }
  });

  it('passes the error to the next outer catch when an inner catch rethrows', async () => {
    @Interceptor()
    class Inner extends NestifyInterceptor {
      intercept(_context: ExecutionContext, next: NestifyInterceptorNextHandler) {
        return next.catch(() => {
          throw new Error('inner');
        });
      }
    }
    @Interceptor()
    class Outer extends NestifyInterceptor {
      intercept(_context: ExecutionContext, next: NestifyInterceptorNextHandler) {
        return next.catch((error: Error) => ({ handled: error.message }));
      }
    }
    @Controller()
    @UseInterceptors(Outer, Inner)
    class ControllerClass {
      @Get()
      handle() {
        throw new Error('boom');
      }
    }
    @Module({ controllers: [ControllerClass], providers: [Outer, Inner] })
    class LocalApp {}
    const app = await nestify(LocalApp);
    try {
      const response = await app.inject('/');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ handled: 'inner' });
    } finally {
      await app.close();
    }
  });

  it('falls back to the filter when no interceptor recovers', async () => {
    @Interceptor()
    class Noop extends NestifyInterceptor {
      intercept(_context: ExecutionContext, next: NestifyInterceptorNextHandler) {
        return next.catch(() => {
          throw new Error('cannot recover');
        });
      }
    }
    @Controller()
    @UseInterceptors(Noop)
    class ControllerClass {
      @Get()
      handle() {
        throw new Error('boom');
      }
    }
    @Module({ controllers: [ControllerClass], providers: [Noop] })
    class LocalApp {}
    const app = await nestify(LocalApp);
    try {
      const response = await app.inject('/');
      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({ message: 'cannot recover' });
    } finally {
      await app.close();
    }
  });
});
