import type { AnyFunction, Constructor } from '@core/types/primitives.js';
import type { NestifyInstance } from '@core/types/instance.js';

import { CronExpressionParser } from 'cron-parser';
import { _entries, _noop, getOrInsertWeak, promiseTry, sym } from '@nestify-js/shared';
import { expectMethodDecorator } from '@core/asserts/decorator-context.js';
import { metaGet, metaSet } from '@core/register/meta.js';

interface CronMeta {
  expression: string;
  uid?: string;
}

interface JobData {
  uid?: string;
  fn: AnyFunction;
  expression: string;
  nextTime: number;
  timer: NodeJS.Timeout | null;
  running: boolean;
}

export function Cron(expression: string, uid?: string): AnyFunction {
  // ! Throws when expression is invalid.
  CronExpressionParser.parse(expression);

  return function (target: AnyFunction, context: ClassMethodDecoratorContext) {
    expectMethodDecorator(target, context);
    metaSet<CronMeta>(context, [sym.cron, context.name], { expression, uid });
  };
}

// 2 ** 31 - 1. Maximum delay for setTimeout in Node.js (approximately 24.8 days)
const MAX_DELAY = 2147483647;

export function longTimeout(job: JobData, fn: () => void, delay: number): void {
  if (delay >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Delay exceeds the maximum safe integer value.');
  }

  if (delay < MAX_DELAY) {
    job.timer = setTimeout(fn, delay);
  } else {
    job.timer = setTimeout(() => longTimeout(job, fn, delay - MAX_DELAY), MAX_DELAY);
  }
}

const _jobs = new WeakMap<NestifyInstance, JobData[]>();

/**
 * Bind cron jobs for a given instance
 * This function is called in lazy injector after all instances are created
 */
export function bindCronJob(app: NestifyInstance, instance: InstanceType<Constructor>, sourceClass: Constructor) {
  const cronMeta = metaGet<Record<string, CronMeta>>(sourceClass, [sym.cron]);
  if (!cronMeta) {
    app.launchCronJobs ??= _noop;
    app.startCronJob ??= _noop;
    app.stopCronJob ??= _noop;
    app.getCronJobStates ??= () => [];
    return;
  }

  const cronJobs: JobData[] = getOrInsertWeak(_jobs, app, []);

  app.launchCronJobs ??= () => {
    for (let i = 0; i < cronJobs.length; i++) {
      const job = cronJobs[i];
      // ! Won't start the running jobs.
      if (!job.running) {
        job.running = true;
        cronJobs[i].fn(app);
      }
    }
  };

  app.startCronJob ??= (uid: string) => {
    if (uid === undefined) {
      console.warn(`startCronJob called with undefined uid, ignored.`);
      return;
    }

    const job = cronJobs.find((j) => j.uid === uid);

    // Non-exist or already running, no need to start again
    if (!job || job.running) {
      return;
    }

    job.running = true;
    job.fn();
  };

  app.stopCronJob ??= (uid: string) => {
    if (uid === undefined) {
      console.warn(`stopCronJob called with undefined uid, ignored.`);
      return;
    }

    const job = cronJobs.find((j) => j.uid === uid);
    if (!job) {
      return;
    }

    job.running = false;

    if (job.timer) {
      clearTimeout(job.timer);
      job.timer = null;
    }
    job.nextTime = -1;
  };

  app.getCronJobStates ??= () => {
    return cronJobs.map(({ uid, expression, nextTime, running }) => ({
      uid,
      expression,
      nextTime,
      running,
    }));
  };

  const err = (...args: Parameters<typeof app.log.error>) => app.log.error(...args);
  const entries = _entries(cronMeta);
  for (let i = 0; i < entries.length; i++) {
    const target = instance[entries[i][0]] as () => void;
    const { expression, uid } = entries[i][1];

    const fn = () => {
      if (!job.running) {
        return;
      }

      job.nextTime = CronExpressionParser.parse(expression).next().getTime();
      // & Parse every time so delta is always positive.
      // & Sharing the same parsed object might lead to a negative delta.
      const delta = job.nextTime - Date.now();

      longTimeout(job, () => promiseTry(target, instance).catch(err).finally(fn), delta);
    };

    const job: JobData = {
      uid,
      fn,
      expression,
      nextTime: -1,
      timer: null,
      running: false,
    };

    cronJobs.push(job);
  }
}

export namespace CronExpressions {
  export const EVERY_SECOND = '* * * * * *';
  export const EVERY_30_SECONDS = '*/30 * * * * *';
  export const EVERY_MINUTE = '* * * * *';
  export const EVERY_5_MINUTES = '*/5 * * * *';
  export const EVERY_10_MINUTES = '*/10 * * * *';
  export const EVERY_15_MINUTES = '*/15 * * * *';
  export const EVERY_30_MINUTES = '*/30 * * * *';
  export const HOURLY = '0 * * * *';
  export const DAILY = '0 0 * * *';
  export const WEEKLY = '0 0 * * 0';
  export const MONTHLY = '0 0 1 * *';
  export const YEARLY = '0 0 1 1 *';
}
