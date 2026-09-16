import { describe, expect, it } from 'vitest';
import {
  nestify,
  Controller,
  Get,
  Guard,
  Inject,
  Injectable,
  Module,
  NestifyGuard,
  type ExecutionContext,
} from '@core/index.js';

@Injectable()
class CounterService {
  value = 0;

  increment() {
    return ++this.value;
  }
}

@Guard()
class FirstAppGuard extends NestifyGuard {
  canActivate(_context: ExecutionContext) {
    return true;
  }
}

@Controller('counter')
class CounterController {
  @Inject(CounterService)
  counter!: CounterService;

  @Get()
  increment() {
    return { value: this.counter.increment() };
  }
}

@Module({ providers: [CounterService], controllers: [CounterController] })
class AppModule {}

describe('multiple Nestify instances', () => {
  it('isolates providers, controllers and global middleware collections per app', async () => {
    const [first, second] = await Promise.all([
      nestify(AppModule, { useGlobalGuards: [FirstAppGuard] }),
      nestify(AppModule),
    ]);

    try {
      expect(first.injector).not.toBe(second.injector);
      expect(first.collection).not.toBe(second.collection);
      expect(first.injector.get(CounterService)).not.toBe(second.injector.get(CounterService));
      expect(first.collection.globalGuards).toEqual(['FirstAppGuard']);
      expect(second.collection.globalGuards).toEqual([]);

      expect(JSON.parse((await first.inject({ method: 'GET', url: '/counter/' })).body)).toEqual({ value: 1 });
      expect(JSON.parse((await first.inject({ method: 'GET', url: '/counter/' })).body)).toEqual({ value: 2 });
      expect(JSON.parse((await second.inject({ method: 'GET', url: '/counter/' })).body)).toEqual({ value: 1 });
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});
