import { describe, expect, it } from 'vitest';
import { NestifyInterceptorNextHandler } from '@core/decorators/middlewares/interceptor.js';

import { runReverseInterceptors } from '../src/register/route/middlewares/interceptor.js';

describe('NestifyInterceptorNextHandler', () => {
  it('can be returned through async code without being treated as a thenable', async () => {
    const next = new NestifyInterceptorNextHandler().map((value: number) => value + 1);

    expect('then' in next).toBe(false);
    await expect(Promise.resolve(next)).resolves.toBe(next);
    await expect(runReverseInterceptors([next], 1)).resolves.toBe(2);
  });

  it('keeps map and catch chainable', async () => {
    const next = new NestifyInterceptorNextHandler()
      .map(() => {
        throw new Error('failed');
      })
      .catch((error: Error) => error.message);

    await expect(
      // sdf
      runReverseInterceptors([next], null),
    ).resolves.toBe('failed');
  });
});
