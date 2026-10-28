import fastify from 'fastify';
import type { FastifyRouteSchemaDef } from 'fastify/types/schema.js';
import { describe, expect, it, vi } from 'vitest';
import {
  apply,
  Body,
  Controller,
  ExecutionContext,
  Filter,
  Get,
  Guard,
  Interceptor,
  Module,
  NestifyFilter,
  NestifyGuard,
  NestifyInterceptor,
  NestifyInterceptorNextHandler,
  Opt,
  Params,
  PipeBody,
  PipeQuery,
  Post,
  Query,
  UseFilters,
  UseGuards,
  UsePipes,
  type NestifyInstance,
} from '@core/index.js';
import { BadRequestException } from '@core/exceptions/index.js';

function createApp() {
  return fastify() as unknown as NestifyInstance;
}

describe('request validation', () => {
  it('validates Nestify pipes without disabling validation for native routes', async () => {
    @Controller()
    class ControllerClass {
      @Post('body')
      @Body({ type: 'object', required: ['name'] })
      handle(body: unknown) {
        return body;
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}

    const app = createApp();
    await apply(app, { rootModule: App });
    app.post('/native', { schema: { body: { type: 'object', required: ['name'] } } }, () => 'ok');
    try {
      expect((await app.inject({ method: 'POST', url: '/body', payload: {} })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/body', payload: { name: 'ok' } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/native', payload: {} })).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('runs guards and matching filters on a route validation error', async () => {
    const guard = vi.fn();
    const filter = vi.fn();
    @Guard()
    class GuardClass extends NestifyGuard {
      canActivate() {
        guard();
        return true;
      }
    }
    @Filter(BadRequestException)
    class FilterClass extends NestifyFilter {
      catch(context: ExecutionContext) {
        filter();
        context.switchToHttp().getReply().status(422).send('filtered');
      }
    }
    @Controller()
    @UseGuards(GuardClass)
    @UseFilters(FilterClass)
    class ControllerClass {
      @Post()
      @Body({ type: 'object', required: ['name'] })
      handle() {
        return 'unreachable';
      }
    }
    @Module({ controllers: [ControllerClass], providers: [GuardClass, FilterClass] })
    class App {}
    const app = createApp();
    await apply(app, { rootModule: App });
    try {
      const response = await app.inject({ method: 'POST', url: '/', payload: {} });
      expect(response.statusCode).toBe(422);
      expect(guard).toHaveBeenCalledOnce();
      expect(filter).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('isolates custom compilers across apps, routes and HTTP parts', async () => {
    const schema = { type: 'object' };
    const compileA = vi.fn(({ httpPart }: FastifyRouteSchemaDef<unknown>) => () => ({
      value: { source: 'a', part: httpPart },
    }));
    const compileB = vi.fn(({ httpPart }: FastifyRouteSchemaDef<unknown>) => () => ({
      value: { source: 'b', part: httpPart },
    }));

    @Controller()
    @UsePipes({ pipe: PipeBody, schema: { body: schema } }, { pipe: PipeQuery, schema: { querystring: schema } })
    class ControllerClass {
      @Post('one')
      first(value: unknown) {
        return value;
      }
      @Post('two')
      second(value: unknown) {
        return value;
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const first = createApp();
    const second = createApp();
    first.setValidatorCompiler(compileA);
    second.setValidatorCompiler(compileB);
    await apply(first, { rootModule: App });
    await apply(second, { rootModule: App });
    try {
      expect((await first.inject({ method: 'POST', url: '/one', payload: {} })).json()).toEqual({
        source: 'a',
        part: 'querystring',
      });
      expect((await second.inject({ method: 'POST', url: '/one', payload: {} })).json()).toEqual({
        source: 'b',
        part: 'querystring',
      });
      expect((await first.inject({ method: 'POST', url: '/two', payload: {} })).json()).toEqual({
        source: 'a',
        part: 'querystring',
      });
      expect(compileA.mock.calls.map(([definition]) => [definition.url, definition.httpPart])).toEqual([
        ['/one', 'body'],
        ['/one', 'querystring'],
        ['/two', 'body'],
        ['/two', 'querystring'],
      ]);
      expect(compileB).toHaveBeenCalledTimes(2);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });

  it('uses route-specific compilers for pipe schemas not attached to the route', async () => {
    const schema = { type: 'object' };
    const routeCompiler = vi.fn(() => () => ({ value: { route: true } }));
    @Controller()
    @UsePipes({ pipe: PipeBody, schema: { body: schema } })
    class ControllerClass {
      @Post()
      @Opt({ validatorCompiler: routeCompiler })
      handle(body: unknown) {
        return body;
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    app.setValidatorCompiler(() => () => ({ value: { route: false } }));
    await apply(app, { rootModule: App });
    try {
      expect((await app.inject({ method: 'POST', url: '/', payload: {} })).json()).toEqual({ route: true });
      expect(routeCompiler).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('does not re-run the route validator in the built-in pipe', async () => {
    const validate = vi.fn((body: unknown) => ({ value: body }));
    @Controller()
    class ControllerClass {
      @Post()
      @Body({ type: 'object' })
      handle(body: unknown) {
        return body;
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    app.setValidatorCompiler(() => validate);
    await apply(app, { rootModule: App });
    try {
      expect((await app.inject({ method: 'POST', url: '/', payload: { name: 'ok' } })).statusCode).toBe(200);
      expect(validate).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('passes falsy transformed values returned by a route validator', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      @Body({ type: 'string' })
      handle(body: unknown) {
        return { body };
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    app.setValidatorCompiler(() => () => ({ value: false }));
    await apply(app, { rootModule: App });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        headers: { 'content-type': 'text/plain' },
        payload: 'anything',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ body: false });
    } finally {
      await app.close();
    }
  });

  it('uses the compiler currently configured on the app for a pipe', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      @Body({ type: 'object' })
      handle(body: unknown) {
        return body;
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    app.setValidatorCompiler(() => () => ({ value: { compiler: 'old' } }));
    await apply(app, { rootModule: App });
    app.setValidatorCompiler(() => () => ({ value: { compiler: 'new' } }));
    try {
      const response = await app.inject({ method: 'POST', url: '/', payload: {} });
      expect(response.json()).toEqual({ compiler: 'new' });
    } finally {
      await app.close();
    }
  });

  it('uses a route-specific compiler for a built-in method pipe', async () => {
    const validate = vi.fn(() => ({ value: false }));
    @Controller()
    class ControllerClass {
      @Post()
      @Opt({ validatorCompiler: () => validate })
      @Body({ type: 'object' })
      handle(body: unknown) {
        return { body };
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    app.setValidatorCompiler(() => () => ({ value: true }));
    await apply(app, { rootModule: App });
    try {
      const response = await app.inject({ method: 'POST', url: '/', payload: {} });
      expect(response.json()).toEqual({ body: false });
      expect(validate).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('rejects request schemas that the built-in pipe does not validate', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      @Body({ type: 'object' }, undefined, { headers: { type: 'object' } })
      handle() {
        return 'unreachable';
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    try {
      await expect(apply(app, { rootModule: App })).rejects.toThrow(/schema\.headers.*not validated/);
    } finally {
      await app.close();
    }
  });

  it('uses the default compiler for schemas only attached to controller pipes', async () => {
    @Controller()
    @UsePipes({ pipe: PipeBody, schema: { body: { type: 'object', required: ['name'] } } })
    class ControllerClass {
      @Post()
      handle(body: unknown) {
        return body;
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    await apply(app, { rootModule: App });
    try {
      expect((await app.inject({ method: 'POST', url: '/', payload: {} })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/', payload: { name: 'ok' } })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('does not silently accept a false JSON Schema', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      @Body(false)
      handle() {
        return 'unreachable';
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    await apply(app, { rootModule: App });
    try {
      expect((await app.inject({ method: 'POST', url: '/', payload: {} })).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('ignores attachValidation and still rejects invalid pipe input', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      @Opt({ attachValidation: true })
      @Body({ type: 'object', required: ['name'] })
      handle() {
        return 'unreachable';
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    await apply(app, { rootModule: App });
    try {
      const response = await app.inject({ method: 'POST', url: '/', payload: {} });
      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('runs guards and interceptors before default validation and transformation', async () => {
    const events: string[] = [];
    @Guard()
    class GuardClass extends NestifyGuard {
      canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest<{ query: { value: unknown } }>();
        events.push(`guard:${typeof request.query.value}`);
        return true;
      }
    }
    @Interceptor()
    class InterceptorClass extends NestifyInterceptor {
      intercept(_context: ExecutionContext, next: NestifyInterceptorNextHandler) {
        events.push('interceptor');
        return next;
      }
    }
    @Controller()
    @UseGuards(GuardClass)
    class ControllerClass {
      @Get()
      @Query({ type: 'object', properties: { value: { type: 'integer' } }, required: ['value'] })
      handle(query: { value: number }) {
        events.push(`handler:${typeof query.value}`);
        return query;
      }
    }
    @Module({ controllers: [ControllerClass], providers: [GuardClass] })
    class App {}
    const app = createApp();
    await apply(app, { rootModule: App, useGlobalInterceptors: [InterceptorClass] });
    try {
      const valid = await app.inject('/?value=7');
      expect(valid.json()).toEqual({ value: 7 });
      expect(events).toEqual(['guard:string', 'interceptor', 'handler:number']);
      events.length = 0;
      expect((await app.inject('/?value=invalid')).statusCode).toBe(400);
      expect(events).toEqual(['guard:string', 'interceptor']);
    } finally {
      await app.close();
    }
  });

  it('does not execute a validator when a guard denies the request', async () => {
    const validate = vi.fn(() => true);
    @Guard()
    class DenyGuard extends NestifyGuard {
      canActivate() {
        return false;
      }
    }
    @Controller()
    @UseGuards(DenyGuard)
    class ControllerClass {
      @Post()
      @Body({ type: 'object' })
      handle() {
        return 'unreachable';
      }
    }
    @Module({ controllers: [ControllerClass], providers: [DenyGuard] })
    class App {}
    const app = createApp();
    app.setValidatorCompiler(() => validate);
    await apply(app, { rootModule: App });
    try {
      expect((await app.inject({ method: 'POST', url: '/', payload: {} })).statusCode).toBe(403);
      expect(validate).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('validates and transforms route parameters in the built-in pipe', async () => {
    @Controller()
    class ControllerClass {
      @Get(':id')
      @Params({ type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] })
      handle(params: { id: number }) {
        return params;
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    await apply(app, { rootModule: App });
    try {
      expect((await app.inject('/42')).json()).toEqual({ id: 42 });
      expect((await app.inject('/invalid')).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('preserves Fastify response serialization schemas', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      @Body({ type: 'object' }, { type: 'object', properties: { ok: { type: 'string' } }, required: ['ok'] })
      handle() {
        return { ok: 'yes', hidden: 'not serialized' };
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    await apply(app, { rootModule: App });
    try {
      expect((await app.inject({ method: 'POST', url: '/', payload: {} })).json()).toEqual({ ok: 'yes' });
    } finally {
      await app.close();
    }
  });

  it('rejects request schemas in Fastify route options', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      @Opt({ schema: { body: { type: 'object' } } })
      handle() {
        return 'unreachable';
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    try {
      await expect(apply(app, { rootModule: App })).rejects.toThrow(/schema\.body in route options/);
    } finally {
      await app.close();
    }
  });

  it('loads shared Fastify schemas into the independent compiler', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      @Body({ $ref: 'person#' })
      handle(body: unknown) {
        return body;
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = createApp();
    app.addSchema({ $id: 'person', type: 'object', required: ['name'] });
    await apply(app, { rootModule: App });
    try {
      expect((await app.inject({ method: 'POST', url: '/', payload: {} })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/', payload: { name: 'ok' } })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('isolates independent default compilers and their shared schemas between apps', async () => {
    @Controller()
    class ControllerClass {
      @Post()
      @Body({ $ref: 'person#' })
      handle(body: unknown) {
        return body;
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const first = createApp();
    const second = createApp();
    first.addSchema({ $id: 'person', type: 'object', required: ['name'] });
    second.addSchema({ $id: 'person', type: 'object', required: ['email'] });
    await apply(first, { rootModule: App });
    await apply(second, { rootModule: App });
    try {
      expect((await first.inject({ method: 'POST', url: '/', payload: { name: 'ok' } })).statusCode).toBe(200);
      expect((await second.inject({ method: 'POST', url: '/', payload: { name: 'ok' } })).statusCode).toBe(400);
      expect((await second.inject({ method: 'POST', url: '/', payload: { email: 'ok' } })).statusCode).toBe(200);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });

  it('does not replace an existing compiler if registration fails', async () => {
    const app = createApp();
    const compiler = vi.fn(() => () => true);
    app.setValidatorCompiler(compiler);
    @Module({
      providers: [
        {
          provide: 'failure',
          useFactory: () => {
            throw new Error('registration failed');
          },
        },
      ],
    })
    class App {}
    try {
      await expect(apply(app, { rootModule: App })).rejects.toThrow('registration failed');
      expect(app.validatorCompiler).toBe(compiler);
    } finally {
      await app.close();
    }
  });
});
