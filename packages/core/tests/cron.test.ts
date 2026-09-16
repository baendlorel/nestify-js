import fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Cron, bindCronJob } from '@core/schedule/cron.js';
import type { NestifyInstance } from '@core/types/instance.js';

describe('cron lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops and removes cron jobs when the application closes', async () => {
    vi.useFakeTimers();
    const run = vi.fn();

    class ScheduledTask {
      @Cron('* * * * * *', 'close-test')
      handle() {
        run();
      }
    }

    const app = fastify();
    bindCronJob(app as any, new ScheduledTask(), ScheduledTask);

    const nestifyApp = app as unknown as NestifyInstance;
    nestifyApp.launchCronJobs();
    expect(nestifyApp.getCronJobStates()).toMatchObject([{ uid: 'close-test', running: true }]);

    await app.close();
    await vi.advanceTimersByTimeAsync(2000);

    expect(run).not.toHaveBeenCalled();
    expect(nestifyApp.getCronJobStates()).toEqual([]);
  });
});
