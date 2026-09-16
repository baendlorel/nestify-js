import type { FastifyInstance } from 'fastify';
import type { Collection } from '@core/register/collection.js';
import type { Injector } from '@core/register/lazy-injector.js';

export interface NestifyInstance extends FastifyInstance {
  /**
   * @internal
   */
  injector: Injector;

  /**
   * @internal
   */
  collection: Collection;

  /**
   * Start all registered cron jobs
   * This function is called after all modules are initialized and the application is ready
   * @internal
   */
  launchCronJobs(): void;

  /**
   * Start a specific cron job by its UID.
   */
  startCronJob(uid: string): void;

  /**
   * Stop a specific cron job by its UID.
   */
  stopCronJob(uid: string): void;

  /**
   * Readonly list of all registered cron jobs with their current states.
   */
  getCronJobStates(): Array<{
    uid?: string;
    expression: string;
    nextTime: number;
    running: boolean;
  }>;
}
