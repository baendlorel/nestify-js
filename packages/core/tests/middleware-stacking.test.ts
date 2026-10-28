import { describe, expect, it } from 'vitest';
import {
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
  NestifyPipe,
  Pipe,
  Post,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  nestify,
} from '@core/index.js';

/**
 * Shared trace of every middleware that actually ran.
 * Decorators are applied bottom-up, so the declaration closest to the handler runs first.
 */
const calls: string[] = [];

@Pipe()
class PipeCloser extends NestifyPipe {
  transform(_context: ExecutionContext, input: any[] = []): any[] {
    calls.push('pipeCloser');
    return input;
  }
}

@Pipe()
class PipeUpper extends NestifyPipe {
  transform(_context: ExecutionContext, input: any[] = []): any[] {
    calls.push('pipeUpper');
    return input;
  }
}

@Guard()
class GuardCloser extends NestifyGuard {
  canActivate() {
    calls.push('guardCloser');
    return true;
  }
}

@Guard()
class GuardUpper extends NestifyGuard {
  canActivate() {
    calls.push('guardUpper');
    return true;
  }
}

@Interceptor()
class InterceptorCloser extends NestifyInterceptor {
  intercept(_context: ExecutionContext, next: NestifyInterceptorNextHandler) {
    calls.push('interceptorCloser');
    return next.map((value: string) => `${value}|closer`);
  }
}

@Interceptor()
class InterceptorUpper extends NestifyInterceptor {
  intercept(_context: ExecutionContext, next: NestifyInterceptorNextHandler) {
    calls.push('interceptorUpper');
    return next.map((value: string) => `${value}|upper`);
  }
}

@Filter(TypeError)
class FilterCloser extends NestifyFilter {
  catch(context: ExecutionContext) {
    calls.push('filterCloser');
    context.switchToHttp().getReply().status(400).send('closer');
  }
}

@Filter(TypeError)
class FilterUpper extends NestifyFilter {
  catch(context: ExecutionContext) {
    calls.push('filterUpper');
    context.switchToHttp().getReply().status(400).send('upper');
  }
}

@Controller()
class StackedController {
  @Get('pipes')
  @UsePipes(PipeUpper)
  @UsePipes(PipeCloser)
  pipes() {
    return { calls: [...calls] };
  }

  @Get('guards')
  @UseGuards(GuardUpper)
  @UseGuards(GuardCloser)
  guards() {
    return { calls: [...calls] };
  }

  @Get('interceptors')
  @UseInterceptors(InterceptorUpper)
  @UseInterceptors(InterceptorCloser)
  interceptors() {
    return 'value';
  }

  @Get('filters')
  @UseFilters(FilterUpper)
  @UseFilters(FilterCloser)
  filters() {
    throw new TypeError('boom');
  }

  @Post('body')
  @Body({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] })
  @UsePipes(PipeCloser)
  body(payload: any) {
    return { payload, calls: [...calls] };
  }
}

@Module({
  controllers: [StackedController],
  providers: [
    PipeCloser,
    PipeUpper,
    GuardCloser,
    GuardUpper,
    InterceptorCloser,
    InterceptorUpper,
    FilterCloser,
    FilterUpper,
  ],
})
class App {}

describe('stacked middleware decorators', () => {
  it('runs every stacked pipe, closest to the handler first', async () => {
    calls.length = 0;
    const app = await nestify(App);
    try {
      const response = await app.inject('/pipes');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ calls: ['pipeCloser', 'pipeUpper'] });
    } finally {
      await app.close();
    }
  });

  it('runs every stacked guard, closest to the handler first', async () => {
    calls.length = 0;
    const app = await nestify(App);
    try {
      const response = await app.inject('/guards');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ calls: ['guardCloser', 'guardUpper'] });
    } finally {
      await app.close();
    }
  });

  it('applies every stacked interceptor', async () => {
    calls.length = 0;
    const app = await nestify(App);
    try {
      const response = await app.inject('/interceptors');
      expect(response.statusCode).toBe(200);
      // `intercept` runs in declaration order, while `map` runs outward:
      // the interceptor closest to the handler is the innermost one.
      expect(response.body).toBe('value|upper|closer');
      expect(calls).toEqual(['interceptorCloser', 'interceptorUpper']);
    } finally {
      await app.close();
    }
  });

  it('keeps every stacked filter and stops at the first one that replies', async () => {
    calls.length = 0;
    const app = await nestify(App);
    try {
      const response = await app.inject('/filters');
      expect(response.statusCode).toBe(400);
      expect(response.body).toBe('closer');
      expect(calls).toEqual(['filterCloser']);
    } finally {
      await app.close();
    }
  });

  it('keeps a built-in pipe together with a user pipe', async () => {
    calls.length = 0;
    const app = await nestify(App);
    try {
      const valid = await app.inject({ method: 'POST', url: '/body', payload: { name: 'nestify' } });
      expect(valid.statusCode).toBe(200);
      expect(valid.json()).toEqual({ payload: { name: 'nestify' }, calls: ['pipeCloser'] });

      const invalid = await app.inject({ method: 'POST', url: '/body', payload: {} });
      expect(invalid.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
