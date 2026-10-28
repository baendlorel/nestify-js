import type { AnyFunction, Constructor } from '@core/types/primitives.js';
import type { NestifyInstance } from '@core/types/instance.js';

import { CronExpressionParser } from 'cron-parser';
import { _entries, getOrInsertWeak, promiseTry, sym } from '@nestify-js/shared';
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
  /**
   * Bumped on every start/stop, so an execution of a previous round can never
   * schedule a timer for the current one.
   */
  generation: number;
}

interface CronStore {
  jobs: JobData[];
  /**
   * Methods already bound, grouped by the instance they belong to.
   * - Keyed by instance, so two instances of the same class keep their own jobs
   */
  boundTargets: WeakMap<object, WeakSet<AnyFunction>>;
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

function longTimeout(job: JobData, fn: () => void, delay: number): void {
  if (delay >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Delay exceeds the maximum safe integer value.');
  }

  if (delay < MAX_DELAY) {
    job.timer = setTimeout(fn, delay);
  } else {
    job.timer = setTimeout(() => longTimeout(job, fn, delay - MAX_DELAY), MAX_DELAY);
  }
}

function startJob(job: JobData) {
  // ! Won't start the running jobs.
  if (job.running) {
    return;
  }

  // FIXED 每次启动推进代次：上一轮仍在执行的 handler 完成后不能再调度计时器，避免重复计时。
  job.generation++;
  job.running = true;
  job.fn();
}

function stopJob(job: JobData) {
  // FIXED 停止时也推进代次，使仍在进行中的执行在结束后无法重新调度。
  job.generation++;
  job.running = false;

  if (job.timer) {
    clearTimeout(job.timer);
    job.timer = null;
  }
  job.nextTime = -1;
}

/**
 * Methods already bound for one instance.
 */
function getBoundTargets(store: CronStore, instance: object): WeakSet<AnyFunction> {
  let targets = store.boundTargets.get(instance);
  if (!targets) {
    targets = new WeakSet();
    store.boundTargets.set(instance, targets);
  }
  return targets;
}

function initMethods(app: NestifyInstance, store: CronStore) {
  // If app's methods are already initialized, skip it.
  if (typeof app.launchCronJobs === 'function') {
    return;
  }

  const jobs = store.jobs;

  app.launchCronJobs = () => {
    for (let i = 0; i < jobs.length; i++) {
      startJob(jobs[i]);
    }
  };

  app.startCronJob = (uid: string) => {
    if (uid === undefined) {
      console.warn(`startCronJob called with undefined uid, ignored.`);
      return;
    }

    const job = jobs.find((j) => j.uid === uid);

    // Non-exist or already running, no need to start again
    if (!job) {
      return;
    }

    startJob(job);
  };

  app.stopCronJob = (uid: string) => {
    if (uid === undefined) {
      console.warn(`stopCronJob called with undefined uid, ignored.`);
      return;
    }

    const job = jobs.find((j) => j.uid === uid);
    if (!job) {
      return;
    }

    stopJob(job);
  };

  app.getCronJobStates = () =>
    jobs.map(({ uid, expression, nextTime, running }) => ({
      uid,
      expression,
      nextTime,
      running,
    }));

  app.addHook('onClose', (_app, done) => {
    for (let i = 0; i < jobs.length; i++) {
      stopJob(jobs[i]);
    }
    jobs.length = 0;
    _stores.delete(app);
    done();
  });
}

const _stores = new WeakMap<NestifyInstance, CronStore>();

/**
 * Bind cron jobs for a given instance
 * This function is called in lazy injector after all instances are created
 */
export function bindCronJob(app: NestifyInstance, instance: InstanceType<Constructor>, sourceClass: Constructor) {
  const cronMeta = metaGet<Record<string, CronMeta>>(sourceClass, [sym.cron]);
  const store = getOrInsertWeak<NestifyInstance, CronStore>(_stores, app, {
    jobs: [],
    boundTargets: new WeakMap(),
  });
  initMethods(app, store);

  if (!cronMeta) {
    return;
  }

  // FIXED 去重改为按「实例 + 方法」：同一类的不同实例各自注册任务，同一实例的重复注册仍只算一次。
  const boundTargets = getBoundTargets(store, instance);
  const err = (...args: Parameters<typeof app.log.error>) => app.log.error(...args);
  const entries = _entries(cronMeta);
  for (let i = 0; i < entries.length; i++) {
    const target = instance[entries[i][0]] as () => void;

    // ! The same instance can be registered under several tokens, bind each method once
    if (boundTargets.has(target)) {
      continue;
    }
    boundTargets.add(target);

    const { expression, uid } = entries[i][1];

    const fn = () => {
      if (!job.running) {
        return;
      }

      // FIXED 记录本次调度的代次，停止或重启后旧执行完成时不再安排下一轮。
      const generation = job.generation;

      job.nextTime = CronExpressionParser.parse(expression).next().getTime();
      // & Parse every time so delta is always positive.
      // & Sharing the same parsed object might lead to a negative delta.
      const delta = job.nextTime - Date.now();

      longTimeout(
        job,
        () =>
          promiseTry(target, instance)
            .catch(err)
            .finally(() => {
              if (job.generation === generation) {
                fn();
              }
            }),
        delta,
      );
    };

    const job: JobData = {
      uid,
      fn,
      expression,
      nextTime: -1,
      timer: null,
      running: false,
      generation: 0,
    };

    store.jobs.push(job);
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
