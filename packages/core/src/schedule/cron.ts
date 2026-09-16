import type { AnyFunction, Constructor } from '@core/types/primitives.js';
import type { NestifyInstance } from '@core/index.js';

import { CronExpressionParser } from 'cron-parser';
import { _entries, promiseTry, sym } from '@nestify-js/shared';
import { expectMethodDecorator } from '@core/asserts/decorator-context.js';
import { metaGet, metaSet } from '@core/register/meta.js';
import { longTimeout } from './long-timeout.js';

interface CronMeta {
  expression: string;
  uid?: string;
}

export function Cron(expression: string, uid?: string): AnyFunction {
  // ! Throws when expression is invalid.
  CronExpressionParser.parse(expression);

  return function (target: AnyFunction, context: ClassMethodDecoratorContext) {
    expectMethodDecorator(target, context);
    metaSet<CronMeta>(context, [sym.cron, context.name], { expression, uid });
  };
}

interface JobData {
  uid?: string;
  fn: AnyFunction;
  expression: string;
  nextTime: number;
  timer: NodeJS.Timeout | null;
}

const cronJobs: JobData[] = [];

/**
 * Bind cron jobs for a given instance
 * This function is called in lazy injector after all instances are created
 */
export function bindCronJob(app: NestifyInstance, instance: InstanceType<Constructor>, sourceClass: Constructor) {
  const cronMeta = metaGet<Record<string, CronMeta>>(sourceClass, [sym.cron]);
  if (!cronMeta) {
    return;
  }

  const logErr = (...args: Parameters<typeof app.log.error>) => app.log.error(...args);

  const entries = _entries(cronMeta);
  for (let i = 0; i < entries.length; i++) {
    const callback = instance[entries[i][0]];
    const { expression, uid } = entries[i][1];

    const fn = () => {
      job.nextTime = CronExpressionParser.parse(expression).next().getTime();
      // & Parse every time so delta is always positive.
      // & Sharing the same parsed object might lead to a negative delta.
      const delta = job.nextTime - Date.now();

      job.timer = longTimeout(() => {
        promiseTry(callback, instance).catch(logErr).finally(fn); // to the next call
      }, delta);
    };

    const job: JobData = {
      uid,
      fn,
      expression,
      nextTime: Infinity,
      timer: null,
    };

    cronJobs.push(job);
  }
}

/**
 * Start all registered cron jobs
 * This function is called after all modules are initialized and the application is ready
 */
export function startCronJobs(app: NestifyInstance) {
  for (let i = 0; i < cronJobs.length; i++) {
    cronJobs[i].fn(app);
  }
}

/**
 * Stop a specific cron job by its UID.
 */
export function stopCronJob(uid: string) {
  if (uid === undefined) {
    console.warn(`stopCronJob called with undefined uid, ignored.`);
    return;
  }

  const job = cronJobs.find((j) => j.uid === uid);
  if (!job) {
    return;
  }

  if (job.timer) {
    clearTimeout(job.timer);
  }
  job.nextTime = Infinity;
}

/**
 * Start a specific cron job by its UID.
 */
export function startCronJob(uid: string) {
  if (uid === undefined) {
    console.warn(`startCronJob called with undefined uid, ignored.`);
    return;
  }
  const job = cronJobs.find((j) => j.uid === uid);
  if (!job) {
    return;
  }

  job.fn();
}

/**
 * Readonly list of all registered cron jobs with their current states.
 */
export function getCronJobStates() {
  return cronJobs.map(({ uid, expression, nextTime, timer }) => ({
    uid,
    expression,
    nextTime,
    state: timer === null ? 'stopped' : 'running',
  }));
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
