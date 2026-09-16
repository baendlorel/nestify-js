import type { AnyFunction, Constructor } from '@core/types/primitives.js';
import type { NestifyInstance } from '@core/index.js';

import { CronExpressionParser } from 'cron-parser';
import { _entries, promiseTry, sym } from '@nestify-js/shared';
import { expectMethodDecorator } from '@core/asserts/decorator-context.js';
import { metaGet, metaSet } from '@core/register/meta.js';

export function Cron(expression: string): AnyFunction {
  return function (target: AnyFunction, context: ClassMethodDecoratorContext) {
    expectMethodDecorator(target, context);
    metaSet<string>(context, [sym.cron, context.name], expression);
  };
}

const cronJobs: AnyFunction[] = [];

/**
 * Bind cron jobs for a given instance
 * This function is called in lazy injector after all instances are created
 */
export function bindCronJob(instance: InstanceType<Constructor>, sourceClass: Constructor) {
  const cronMeta = metaGet<Record<string, string>>(sourceClass, [sym.cron]);
  if (!cronMeta) {
    return;
  }

  const entries = _entries(cronMeta);
  for (let i = 0; i < entries.length; i++) {
    const fn = instance[entries[i][0]];
    const expression = entries[i][1];
    const job = () => {
      const next = CronExpressionParser.parse(expression).next();
      const delta = next.getTime() - Date.now();
      setTimeout(() => {
        promiseTry(fn, instance).catch(console.error).finally(job); // to the next call
      }, delta);
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
    cronJobs[i]();
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
