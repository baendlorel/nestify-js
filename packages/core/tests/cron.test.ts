import fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Cron, bindCronJob } from '@core/schedule/cron.js';
import type { NestifyInstance } from '@core/types/instance.js';

// Node.js `setTimeout` cap, must match `MAX_DELAY` in `schedule/cron.ts`
const MAX_DELAY = 2147483647;

/**
 * `bindCronJob` is called by the injector with an instance that has already been
 * enriched by `apply()`. Unit tests bypass that path, so the cast is done once here.
 */
function cronApp() {
  return fastify({ logger: false }) as unknown as NestifyInstance;
}

describe('cron lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

    const app = cronApp();
    bindCronJob(app, new ScheduledTask(), ScheduledTask);

    app.launchCronJobs();
    expect(app.getCronJobStates()).toMatchObject([{ uid: 'close-test', running: true }]);

    await app.close();
    await vi.advanceTimersByTimeAsync(2000);

    expect(run).not.toHaveBeenCalled();
    expect(app.getCronJobStates()).toEqual([]);
  });

  it('registers every Cron provider, even when a non-Cron provider comes first', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];

    class PlainProvider {}

    class FirstTask {
      @Cron('* * * * * *', 'first')
      handle() {
        calls.push('first');
      }
    }

    class SecondTask {
      @Cron('* * * * * *', 'second')
      handle() {
        calls.push('second');
      }
    }

    const app = cronApp();
    // a provider without any @Cron method must not swallow the cron initialization
    bindCronJob(app, new PlainProvider(), PlainProvider);
    bindCronJob(app, new FirstTask(), FirstTask);
    bindCronJob(app, new SecondTask(), SecondTask);

    expect(app.getCronJobStates().map((s) => s.uid)).toEqual(['first', 'second']);

    app.launchCronJobs();
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toEqual(['first', 'second']);
    await app.close();
  });

  it('is idempotent when launchCronJobs is called repeatedly', async () => {
    vi.useFakeTimers();
    const run = vi.fn();

    class Task {
      @Cron('* * * * * *', 'idempotent')
      handle() {
        run();
      }
    }

    const app = cronApp();
    bindCronJob(app, new Task(), Task);

    app.launchCronJobs();
    app.launchCronJobs();
    app.launchCronJobs();

    // one invocation per second, not one per launchCronJobs call
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(3);
    await app.close();
  });

  it('logs a synchronous throw and keeps rescheduling', async () => {
    vi.useFakeTimers();
    const error = vi.fn();

    class Task {
      @Cron('* * * * * *', 'sync-throw')
      handle() {
        throw new Error('boom');
      }
    }

    const app = cronApp();
    vi.spyOn(app.log, 'error').mockImplementation(error);
    bindCronJob(app, new Task(), Task);
    app.launchCronJobs();

    await vi.advanceTimersByTimeAsync(1000);
    expect(error).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(error).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it('logs an async rejection and keeps rescheduling', async () => {
    vi.useFakeTimers();
    const error = vi.fn();

    class Task {
      @Cron('* * * * * *', 'async-reject')
      async handle() {
        throw new Error('boom');
      }
    }

    const app = cronApp();
    vi.spyOn(app.log, 'error').mockImplementation(error);
    bindCronJob(app, new Task(), Task);
    app.launchCronJobs();

    await vi.advanceTimersByTimeAsync(1000);
    expect(error).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(error).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it('does not reschedule when stopped while the handler promise is still pending', async () => {
    vi.useFakeTimers();
    const run = vi.fn();
    let release!: () => void;

    class Task {
      @Cron('* * * * * *', 'pending')
      async handle() {
        run();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
    }

    const app = cronApp();
    bindCronJob(app, new Task(), Task);
    app.launchCronJobs();

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);

    // stop while the handler is still awaited: `.finally(fn)` must not reschedule
    app.stopCronJob('pending');
    release();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('restarts a stopped job by uid', async () => {
    vi.useFakeTimers();
    const run = vi.fn();

    class Task {
      @Cron('* * * * * *', 'restart')
      handle() {
        run();
      }
    }

    const app = cronApp();
    bindCronJob(app, new Task(), Task);
    app.launchCronJobs();

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);

    app.stopCronJob('restart');
    expect(app.getCronJobStates()[0].running).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(1);

    app.startCronJob('restart');
    expect(app.getCronJobStates()[0].running).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it('keeps two applications isolated from each other', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];

    class TaskA {
      @Cron('* * * * * *', 'a')
      handle() {
        calls.push('a');
      }
    }

    class TaskB {
      @Cron('* * * * * *', 'b')
      handle() {
        calls.push('b');
      }
    }

    const appA = cronApp();
    const appB = cronApp();
    bindCronJob(appA, new TaskA(), TaskA);
    bindCronJob(appB, new TaskB(), TaskB);

    expect(appA.getCronJobStates().map((s) => s.uid)).toEqual(['a']);
    expect(appB.getCronJobStates().map((s) => s.uid)).toEqual(['b']);

    // launching one application must not start the other one's jobs
    appA.launchCronJobs();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual(['a']);

    await appA.close();
    await appB.close();
  });

  it('binds a duplicated instance only once', async () => {
    vi.useFakeTimers();
    const run = vi.fn();

    class Task {
      @Cron('* * * * * *', 'dup')
      handle() {
        run();
      }
    }

    const app = cronApp();
    // `useExisting` puts the same instance under several tokens, so the injector
    // hands the very same object to `bindCronJob` more than once
    const instance = new Task();
    bindCronJob(app, instance, Task);
    bindCronJob(app, instance, Task);
    bindCronJob(app, instance, Task);

    expect(app.getCronJobStates()).toHaveLength(1);

    app.launchCronJobs();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('keeps the long-delay rollover timer cancellable', async () => {
    vi.useFakeTimers();
    const run = vi.fn();

    class YearlyTask {
      // a yearly run is far beyond MAX_DELAY, so the timer has to roll over
      @Cron('0 0 1 1 *', 'yearly')
      handle() {
        run();
      }
    }

    const app = cronApp();
    bindCronJob(app, new YearlyTask(), YearlyTask);
    app.launchCronJobs();

    const [{ nextTime }] = app.getCronJobStates();
    const untilFirstRun = nextTime - Date.now();
    expect(untilFirstRun).toBeGreaterThan(MAX_DELAY);

    // cross a rollover boundary, then stop: the re-armed timer must be cleared
    await vi.advanceTimersByTimeAsync(MAX_DELAY);
    expect(run).not.toHaveBeenCalled();

    app.stopCronJob('yearly');
    await vi.advanceTimersByTimeAsync(untilFirstRun);
    expect(run).not.toHaveBeenCalled();

    await app.close();
  });

  it('fires a long-delay job that is not stopped', async () => {
    vi.useFakeTimers();
    const run = vi.fn();

    class YearlyTask {
      @Cron('0 0 1 1 *', 'yearly')
      handle() {
        run();
      }
    }

    const app = cronApp();
    bindCronJob(app, new YearlyTask(), YearlyTask);
    app.launchCronJobs();

    const [{ nextTime }] = app.getCronJobStates();
    await vi.advanceTimersByTimeAsync(nextTime - Date.now());

    expect(run).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
