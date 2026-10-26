import { describe, it, expect } from 'vitest';
import fastify from 'fastify';

import { Injectable } from '@core/decorators/injectable.js';
import { Inject } from '@core/decorators/inject.js';
import { Module } from '@core/decorators/module.js';
import { Controller } from '@core/decorators/router/controller.js';
import { Get } from '@core/decorators/router/http-methods.js';
import { Guard, NestifyGuard } from '@core/decorators/middlewares/guard.js';
import { apply } from '@core/register/index.js';
import { metaGetModule } from '@core/register/meta.js';
import { APP_GUARD } from '@nestify-js/shared';
import { promiseTry } from '../packages/shared/src/polyfills.js';

describe('Module registration dedupe', () => {
  it('should register a shared module only once in a diamond dependency', async () => {
    @Injectable()
    class LogService {}

    @Controller('logs')
    class LogsController {
      @Inject(LogService)
      logs: any;

      @Get()
      list() {
        return { ok: true };
      }
    }

    @Module({
      providers: [LogService],
      controllers: [LogsController],
      exports: [LogService],
    })
    class LogModule {}

    @Module({ imports: [LogModule] })
    class UserModule {}

    @Module({ imports: [LogModule] })
    class OrderModule {}

    @Module({ imports: [UserModule, OrderModule] })
    class AppModule {}

    const app = fastify();
    await apply(app, { rootModule: AppModule });

    // A duplicated registration would have thrown FST_ERR_DUPLICATED_ROUTE
    const response = await app.inject({ method: 'GET', url: '/logs/' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true });

    // The provider is still a single instance per app
    expect(app.injector.get(LogService)).toBe(app.injector.get('LogService'));

    await app.close();
  });

  it('should allow a module to be imported by the same module twice', async () => {
    @Injectable()
    class Service {}

    @Module({ providers: [Service], exports: [Service] })
    class SharedModule {}

    @Module({ imports: [SharedModule] })
    class AppModule {}

    const app = fastify();
    await apply(app, { rootModule: AppModule });
    await app.close();
  });

  it('should mount controllers only once when imported from several prefixes', async () => {
    @Controller()
    class SharedController {
      @Get()
      index() {
        return {};
      }
    }

    @Module({ controllers: [SharedController], prefix: 'shared' })
    class SharedModule {}

    @Module({ imports: [SharedModule], prefix: 'a' })
    class AModule {}

    @Module({ imports: [SharedModule], prefix: 'b' })
    class BModule {}

    @Module({ imports: [AModule, BModule] })
    class AppModule {}

    const app = fastify();
    await apply(app, { rootModule: AppModule });

    expect((await app.inject({ method: 'GET', url: '/a/shared/' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/b/shared/' })).statusCode).toBe(404);

    await app.close();
  });

  it('should collect APP_GUARD from a global module', async () => {
    @Guard()
    class BlocksAll extends NestifyGuard {
      canActivate() {
        return false;
      }
    }

    @Controller('guarded')
    class GuardedController {
      @Get()
      index() {
        return {};
      }
    }

    @Module({ providers: [{ provide: APP_GUARD, useClass: BlocksAll }] })
    class GuardModule {}

    @Module({ controllers: [GuardedController] })
    class LeafModule {}

    // the guard module is global, so `LeafModule` does not need to import it
    @Module({ imports: [{ moduleClass: GuardModule, isGlobal: true }, LeafModule] })
    class AppModule {}

    const app = fastify();
    await apply(app, { rootModule: AppModule });

    expect(app.collection.globalGuards).toEqual([APP_GUARD]);
    expect((await app.inject({ method: 'GET', url: '/guarded/' })).statusCode).toBe(403);

    await app.close();
  });

  it('should still detect real circular references', async () => {
    // A -> B -> A, via mutually injected classes so the module graph is circular
    @Injectable()
    class A {
      @Inject(() => B)
      b: any;
    }
    @Injectable()
    class B {
      @Inject(() => A)
      a: any;
    }

    @Module({ providers: [A], imports: [] })
    class AModule {}

    @Module({ providers: [B], imports: [AModule] })
    class BModule {}

    // A imports B, B imports A: the module graph is circular
    Reflect.defineProperty(metaGetModule(AModule), 'imports', { value: [BModule] });

    await expect(promiseTry(apply, fastify(), { rootModule: AModule })).rejects.toThrow(
      /Circular dependency detected|_throw is not defined/,
    );
  });
});
