import { describe, expect, it } from 'vitest';
import { Inject, Injectable, Module, toModule, nestify } from '@core/index.js';

class ExternalService {
  readonly kind = 'external';
}

@Injectable()
class ExternalConsumer {
  @Inject(ExternalService) service!: ExternalService;
}

@Module({ imports: [toModule(ExternalService)], providers: [ExternalConsumer] })
class AppModule {}

describe('toModule', () => {
  it('creates the provider without constructor arguments', async () => {
    const app = await nestify(AppModule);
    try {
      const instance = app.injector.get(ExternalService)!;
      expect(instance).toBeInstanceOf(ExternalService);
      expect(instance.kind).toBe('external');
      expect(app.injector.get(ExternalConsumer)!.service).toBe(instance);
    } finally {
      await app.close();
    }
  });

  it('does not accept constructor arguments anymore', () => {
    class AnotherService {}

    // @ts-expect-error `args` is no longer supported, wrap a configured instance in a factory provider
    const dynamicModule = toModule(AnotherService, { args: ['expected'] });

    expect(dynamicModule.isGlobal).toBe(false);
    expect(dynamicModule.moduleClass).toBeTypeOf('function');
  });
});
