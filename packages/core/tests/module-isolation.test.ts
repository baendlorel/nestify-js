import { describe, expect, it } from 'vitest';
import { Inject, Injectable, Module, nestify } from '@core/index.js';

/**
 * `_throw` is a build-time macro that does not exist when sources run directly
 * under vitest. The registration error paths below rely on it, so mirror the
 * build behavior here.
 */
(globalThis as unknown as { _throw?: (message: string) => never })._throw ??= (message) => {
  throw new Error(message);
};

const symbolField = Symbol('symbolField');

const ISOLATION_ERROR = /is not from current\/imported\/global module/;

@Injectable()
class HiddenService {
  readonly secret = 'hidden';
}

@Injectable()
class SymbolConsumer {
  @Inject(HiddenService) [symbolField]!: HiddenService;
}

@Module({ providers: [HiddenService] })
class HiddenModule {}

describe('module isolation', () => {
  it('rejects symbol named injection of a provider from a module that was neither imported nor exported', async () => {
    @Module({ providers: [SymbolConsumer] })
    class HiddenConsumerModule {}

    @Module({ imports: [HiddenModule, HiddenConsumerModule] })
    class AppModule {}

    await expect(nestify(AppModule)).rejects.toThrow(ISOLATION_ERROR);
  });

  it('rejects a useExisting alias pointing to an inaccessible provider', async () => {
    @Module({ providers: [{ provide: 'leaked', useExisting: HiddenService }] })
    class AliasModule {}

    @Module({ imports: [HiddenModule, AliasModule] })
    class AppModule {}

    await expect(nestify(AppModule)).rejects.toThrow(ISOLATION_ERROR);
  });

  it('allows symbol named injection within the same module', async () => {
    @Module({ providers: [HiddenService, SymbolConsumer] })
    class AppModule {}

    const app = await nestify(AppModule);
    try {
      expect(app.injector.get(SymbolConsumer)![symbolField]).toBe(app.injector.get(HiddenService));
    } finally {
      await app.close();
    }
  });

  it('allows symbol named injection of an exported provider', async () => {
    @Module({ providers: [HiddenService], exports: [HiddenService] })
    class PublicModule {}

    @Module({ imports: [PublicModule], providers: [SymbolConsumer] })
    class AppModule {}

    const app = await nestify(AppModule);
    try {
      expect(app.injector.get(SymbolConsumer)![symbolField]).toBe(app.injector.get(HiddenService));
    } finally {
      await app.close();
    }
  });
});
