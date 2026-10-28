import { describe, expect, it } from 'vitest';
import { Controller, Get, Module, nestify } from '@core/index.js';

@Controller('item')
class ItemController {
  @Get()
  list() {
    return { from: 'item' };
  }
}

@Module({ controllers: [ItemController] })
class ChildModule {}

@Module({ imports: [ChildModule], prefix: 'first' })
class FirstModule {}

@Module({ imports: [ChildModule], prefix: 'second' })
class SecondModule {}

@Module({ imports: [FirstModule, SecondModule] })
class MultiPrefixApp {}

describe('a controller declared by more than one module', () => {
  it('registers one route per effective module prefix', async () => {
    const app = await nestify(MultiPrefixApp);
    try {
      const first = await app.inject('/first/item');
      const second = await app.inject('/second/item');

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(first.json()).toEqual({ from: 'item' });
      expect(second.json()).toEqual({ from: 'item' });
    } finally {
      await app.close();
    }
  });

  it('still registers it once per prefix when the module is reachable twice', async () => {
    @Module({ imports: [ChildModule] })
    class PassThroughModule {}

    @Module({ imports: [ChildModule, PassThroughModule] })
    class DiamondApp {}

    // a second registration of the same URL would make fastify throw a duplicate route error
    const app = await nestify(DiamondApp);
    try {
      const response = await app.inject('/item');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ from: 'item' });
    } finally {
      await app.close();
    }
  });
});
