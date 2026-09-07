import { describe, expect, it } from 'vitest';

import { InterceptorNextHandler } from '../src/types/middleware.js';
import { runReverseInterceptors } from '../src/register/route/middlewares/interceptor.js';

describe('InterceptorNextHandler', () => {
  it('can be returned through async code without being treated as a thenable', async () => {
    const next = new InterceptorNextHandler().map((value: number) => value + 1);

    expect('then' in next).toBe(false);
    await expect(Promise.resolve(next)).resolves.toBe(next);
    await expect(runReverseInterceptors([next], 1)).resolves.toBe(2);
  });

  it('keeps map and catch chainable', async () => {
    const next = new InterceptorNextHandler()
      .map(() => {
        throw new Error('failed');
      })
      .catch((error: Error) => error.message);

    await expect(runReverseInterceptors([next], null)).resolves.toBe('failed');
  });
});
