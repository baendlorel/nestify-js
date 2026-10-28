import type { AnyFunction, Constructor } from '@core/types/primitives.js';
import type { NestifyInstance } from '@core/types/instance.js';

import cron, { type ScheduledTask } from 'node-cron';
import { _entries, getOrInsertWeak, promiseTry, sym } from '@nestify-js/shared';
import { expectMethodDecorator } from '@core/asserts/decorator-context.js';
import { metaGet, metaSet } from '@core/register/meta.js';

interface CronMeta {
  expression: string;
  uid?: string;
}

interface JobData {
  uid?: string;
  expression: string;
  task: ScheduledTask;
}

interface CronStore {
  jobs: JobData[];
  /**
   * Methods already bound, grouped by the instance they belong to.
   * - Keyed by instance, so two instances of the same class keep their own jobs
   */
  boundTargets: WeakMap<object, WeakSet<AnyFunction>>;
}

/**
 * Mark a method as a cron job.
 * - Only metadata is registered here, scheduling is delegated to `node-cron`
 * @param expression cron expression, validated by `node-cron`
 * @param uid optional unique id, used by `startCronJob` / `stopCronJob`
 */
export function Cron(expression: string, uid?: string): AnyFunction {
  // ! Throws when expression is invalid.
  if (!cron.validate(expression)) {
    // FIXED 表达式校验交给 node-cron，避免自研解析与真正的调度器语法不一致。
    throw new Error(`Invalid cron expression: '${expression}'`);
  }

  return function (target: AnyFunction, context: ClassMethodDecoratorContext) {
    expectMethodDecorator(target, context);
    metaSet<CronMeta>(context, [sym.cron, context.name], { expression, uid });
  };
}

/**
 * `node-cron` reports `stopped` before the task is started and `destroyed` after it
 * is removed, so any other state means the job is enabled.
 */
function isRunning(task: ScheduledTask): boolean {
  const status = task.getStatus();
  return status === 'idle' || status === 'running';
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
  const findJob = (uid: string) => jobs.find((job) => job.uid === uid);

  app.launchCronJobs = () => {
    for (let i = 0; i < jobs.length; i++) {
      // ! `start()` is a no-op when the task is already started.
      jobs[i].task.start();
    }
  };

  app.startCronJob = (uid: string) => {
    if (uid === undefined) {
      console.warn(`startCronJob called with undefined uid, ignored.`);
      return;
    }

    findJob(uid)?.task.start();
  };

  app.stopCronJob = (uid: string) => {
    if (uid === undefined) {
      console.warn(`stopCronJob called with undefined uid, ignored.`);
      return;
    }

    findJob(uid)?.task.stop();
  };

  app.getCronJobStates = () =>
    jobs.map(({ uid, expression, task }) => ({
      uid,
      expression,
      // `node-cron` returns `null` while the task is not started
      nextTime: task.getNextRun()?.getTime() ?? -1,
      running: isRunning(task),
    }));

  app.addHook('onClose', (_app, done) => {
    for (let i = 0; i < jobs.length; i++) {
      // FIXED 关闭应用时直接销毁任务，计时与取消完全交给 node-cron。
      jobs[i].task.destroy();
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

  // FIXED 去重仍按「实例 + 方法」：同一实例的多个 token 只绑定一次，同类的不同实例各自独立。
  const boundTargets = getBoundTargets(store, instance);
  const err = (...args: Parameters<typeof app.log.error>) => app.log.error(...args);
  const entries = _entries(cronMeta);

  for (let i = 0; i < entries.length; i++) {
    const target = instance[entries[i][0]] as AnyFunction;

    // ! The same instance can be registered under several tokens, bind each method once
    if (boundTargets.has(target)) {
      continue;
    }
    boundTargets.add(target);

    const { expression, uid } = entries[i][1];

    // FIXED 只创建任务；计时、重叠控制与取消全部由 node-cron 实现。
    const task = cron.createTask(expression, () => promiseTry(target, instance).catch(err));

    store.jobs.push({ uid, expression, task });
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
