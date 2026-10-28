import { describe, expect, it } from 'vitest';
import { Inject, Injectable, Module, nestify } from '@core/index.js';

/**
 * `_throw` is a build-time macro that does not exist when sources run directly
 * under vitest, so mirror the build behavior for the error assertions below.
 */
(globalThis as unknown as { _throw?: (message: string) => never })._throw ??= (message) => {
  throw new Error(message);
};

const PRIMITIVE_VALUES: Array<[string, unknown]> = [
  ['number', 1],
  ['zero', 0],
  ['empty-string', ''],
  ['false', false],
  ['null', null],
  ['undefined', undefined],
];

@Injectable()
class AliasConsumer {
  @Inject('number-alias') numberAlias!: number;
  @Inject('zero-alias') zeroAlias!: number;
  @Inject('empty-string-alias') emptyStringAlias!: string;
  @Inject('false-alias') falseAlias!: boolean;
  @Inject('null-alias') nullAlias!: null;
}

describe('provider values', () => {
  it('aliases primitive and falsy useValue providers through useExisting', async () => {
    @Module({
      providers: [
        ...PRIMITIVE_VALUES.flatMap(([name, value]) => [
          { provide: name, useValue: value },
          { provide: `${name}-alias`, useExisting: name },
        ]),
        AliasConsumer,
      ],
    })
    class AppModule {}

    const app = await nestify(AppModule);
    try {
      for (const [name, value] of PRIMITIVE_VALUES) {
        expect(app.injector.get<any>(`${name}-alias`)).toBe(value);
      }

      const consumer = app.injector.get(AliasConsumer)!;
      expect(consumer.numberAlias).toBe(1);
      expect(consumer.zeroAlias).toBe(0);
      expect(consumer.emptyStringAlias).toBe('');
      expect(consumer.falseAlias).toBe(false);
      expect(consumer.nullAlias).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('rejects an async factory instead of injecting a Promise', async () => {
    @Module({ providers: [{ provide: 'ready', useFactory: async () => 'ready' }] })
    class AppModule {}

    await expect(nestify(AppModule)).rejects.toThrow(/Async factory for 'ready' is not supported/);
  });

  it('accepts a synchronous factory', async () => {
    @Module({ providers: [{ provide: 'ready', useFactory: () => 'ready' }] })
    class AppModule {}

    const app = await nestify(AppModule);
    try {
      expect(app.injector.get<any>('ready')).toBe('ready');
    } finally {
      await app.close();
    }
  });
});
