import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  Controller,
  ExecutionContext,
  Filter,
  Get,
  Module,
  NestifyFilter,
  NotFoundException,
  UseFilters,
  nestify,
} from '@core/index.js';

describe('exception filter dispatch', () => {
  it('skips nonmatching filters and stops after the first response', async () => {
    const wrong = vi.fn();
    const matching = vi.fn();
    const later = vi.fn();
    @Filter(TypeError)
    class Wrong extends NestifyFilter {
      catch() {
        wrong();
      }
    }
    @Filter(BadRequestException)
    class Matching extends NestifyFilter {
      async catch(context: ExecutionContext) {
        matching();
        context.switchToHttp().getReply().status(418).send('handled');
      }
    }
    @Filter()
    class Later extends NestifyFilter {
      catch() {
        later();
      }
    }
    @Controller()
    @UseFilters(Wrong, Matching, Later)
    class ControllerClass {
      @Get()
      handle() {
        throw new BadRequestException('bad');
      }
    }
    @Module({ controllers: [ControllerClass], providers: [Wrong, Matching, Later] })
    class App {}
    const app = await nestify(App);
    try {
      const response = await app.inject('/');
      expect(response.statusCode).toBe(418);
      expect(response.body).toBe('handled');
      expect(wrong).not.toHaveBeenCalled();
      expect(matching).toHaveBeenCalledOnce();
      expect(later).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('runs catch-all filters and falls back when none sends a response', async () => {
    const catchAll = vi.fn();
    @Filter(TypeError)
    class Wrong extends NestifyFilter {
      catch() {
        throw new Error('must not run');
      }
    }
    @Filter()
    class CatchAll extends NestifyFilter {
      catch() {
        catchAll();
      }
    }
    @Controller()
    @UseFilters(Wrong, CatchAll)
    class ControllerClass {
      @Get()
      handle() {
        throw new BadRequestException('original');
      }
    }
    @Module({ controllers: [ControllerClass], providers: [Wrong, CatchAll] })
    class App {}
    const app = await nestify(App);
    try {
      const response = await app.inject('/');
      expect(catchAll).toHaveBeenCalledOnce();
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ message: 'original' });
    } finally {
      await app.close();
    }
  });

  it('lets a catch-all filter send the response', async () => {
    @Filter()
    class CatchAll extends NestifyFilter {
      catch(context: ExecutionContext) {
        context.switchToHttp().getReply().status(409).send('all');
      }
    }
    @Controller()
    @UseFilters(CatchAll)
    class ControllerClass {
      @Get()
      handle() {
        throw new Error('test');
      }
    }
    @Module({ controllers: [ControllerClass], providers: [CatchAll] })
    class App {}
    const app = await nestify(App);
    try {
      const response = await app.inject('/');
      expect(response.statusCode).toBe(409);
      expect(response.body).toBe('all');
    } finally {
      await app.close();
    }
  });

  it('keeps the status and response of an explicit HttpException', async () => {
    @Controller()
    class ControllerClass {
      @Get()
      handle() {
        throw new NotFoundException('missing item');
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = await nestify(App);
    try {
      const response = await app.inject('/');
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'missing item' });
    } finally {
      await app.close();
    }
  });

  it('keeps the original message of unknown errors by default', async () => {
    @Controller()
    class ControllerClass {
      @Get()
      handle() {
        throw new Error('sensitive database detail');
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = await nestify(App);
    try {
      const response = await app.inject('/');
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: 'Internal Server Error',
        statusCode: 500,
        message: 'sensitive database detail',
      });
    } finally {
      await app.close();
    }
  });

  it('hides the message of unknown errors when `onlyInternalServerError` is enabled', async () => {
    @Controller()
    class ControllerClass {
      @Get()
      handle() {
        throw new Error('sensitive database detail');
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = await nestify(App, { onlyInternalServerError: true });
    try {
      const response = await app.inject('/');
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('sensitive database detail');
      expect(response.json()).toEqual({
        error: 'Internal Server Error',
        statusCode: 500,
        message: 'Internal server error',
      });
    } finally {
      await app.close();
    }
  });
});
