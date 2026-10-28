import { describe, expect, it } from 'vitest';
import { Inject, Injectable, Module, nestify } from '@core/index.js';

/**
 * Two different classes intentionally sharing the same `name`.
 * Class tokens must use the constructor identity, so they must never collide.
 */
@Injectable()
class OuterService {
  readonly kind = 'outer';
}
Object.defineProperty(OuterService, 'name', { value: 'Service' });

@Injectable()
class InnerService {
  readonly kind = 'inner';
}
Object.defineProperty(InnerService, 'name', { value: 'Service' });

@Injectable()
class Consumer {
  @Inject(OuterService) outer!: OuterService;
  @Inject(InnerService) inner!: InnerService;
}

describe('DI token identity', () => {
  it('injects the matching instance for two classes sharing the same name', async () => {
    @Module({ providers: [OuterService, InnerService, Consumer] })
    class AppModule {}

    const app = await nestify(AppModule);
    try {
      const outer = app.injector.get(OuterService)!;
      const inner = app.injector.get(InnerService)!;
      const consumer = app.injector.get(Consumer)!;

      expect(outer).not.toBe(inner);
      expect(consumer.outer).toBe(outer);
      expect(consumer.inner).toBe(inner);
      expect(consumer.outer.kind).toBe('outer');
      expect(consumer.inner.kind).toBe('inner');
    } finally {
      await app.close();
    }
  });

  it('keeps string and symbol tokens independent from class tokens', async () => {
    const SYMBOL_TOKEN = Symbol('value');

    @Module({
      providers: [
        OuterService,
        { provide: 'value', useValue: 'string-value' },
        { provide: SYMBOL_TOKEN, useValue: 'symbol-value' },
        { provide: 'alias', useExisting: OuterService },
      ],
    })
    class AppModule {}

    const app = await nestify(AppModule);
    try {
      expect(app.injector.get<any>('value')).toBe('string-value');
      expect(app.injector.get<any>(SYMBOL_TOKEN)).toBe('symbol-value');
      expect(app.injector.get<any>('alias')).toBe(app.injector.get(OuterService));
    } finally {
      await app.close();
    }
  });

  it('exposes exported class providers to importing modules', async () => {
    @Module({ providers: [OuterService], exports: [OuterService] })
    class ServiceModule {}

    @Injectable()
    class ExportedConsumer {
      @Inject(OuterService) service!: OuterService;
    }

    @Module({ imports: [ServiceModule], providers: [ExportedConsumer] })
    class AppModule {}

    const app = await nestify(AppModule);
    try {
      expect(app.injector.get(ExportedConsumer)!.service).toBe(app.injector.get(OuterService));
    } finally {
      await app.close();
    }
  });

  it('exposes class providers exported by a global module', async () => {
    @Module({ providers: [InnerService], exports: [InnerService] })
    class GlobalServiceModule {}

    @Injectable()
    class GlobalConsumer {
      @Inject(InnerService) service!: InnerService;
    }

    @Module({ imports: [{ moduleClass: GlobalServiceModule, isGlobal: true }], providers: [GlobalConsumer] })
    class AppModule {}

    const app = await nestify(AppModule);
    try {
      expect(app.injector.get(GlobalConsumer)!.service).toBe(app.injector.get(InnerService));
    } finally {
      await app.close();
    }
  });
});
