/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifySchema } from 'fastify';
import type { Constructor, SSKey, OrPromise, AnyFunction } from '@nestify-js/shared';
import type { ExecutionContext } from '@core/common/execution-context.js';
import type { InjectToken } from './injection.js';

const _iden = (v: any) => v;

const _idenErr = (e: any) => {
  throw e;
};

/**
 * Get middlewares for a class method
 * - will concat middlewares of global/controller/method level
 * @param classMethod method from the class
 * @returns middleware array
 */
export type MiddlewareGetter<T = InjectToken> = (field: SSKey) => T[];
export type GuardGetter = MiddlewareGetter;
export type InterceptorGetter = MiddlewareGetter;
export type PipeGetter = MiddlewareGetter<PipeOptions>;
export type FilterGetter = MiddlewareGetter;

/**
 * `PipeSchema` is equivalent to FastifySchema.body/params/query...
 */
export type PipeSchema = unknown;

export interface PipeFullSchema {
  body?: PipeSchema;
  querystring?: PipeSchema;
  params?: PipeSchema;
  headers?: PipeSchema;
  response?: PipeSchema;
}

export type RouteApiSchema = Omit<FastifySchema, keyof PipeFullSchema>;

export interface PipeOptions {
  /**
   * Validation schema
   * - if pipe class is not given, will try to use global pipe
   *   - will be ignored when global pipe is not set
   */
  schema?: PipeFullSchema;

  /**
   * Pipe class
   * - if `inputPath` is not given, pipe transformer will take the whole `request`
   */
  pipe: SSKey | Constructor<NestifyPipeLike>;
}

/**
 * You must override the `canActivate` method in your custom guard class.
 */
export interface NestifyGuardLike {
  /**
   * Guard
   * - you can use `throw` when guard fails
   * - will stop and reply if any guard returns `false` or throws an error
   * @param context like in NestJS, it can `.switchToHttp()` and get `request` and `reply` object
   * - if `previousReturn` is `undefined`, it will be ignored.
   */
  canActivate(context: ExecutionContext): OrPromise | OrPromise<boolean>;
}

export interface InterceptorNextHandlerLike {
  /**
   * Register the controller result mapper.
   */
  map(fn: (value: any) => any): this;

  /**
   * Run something with the controller result before it is returned. Usually used for logging.
   */
  tap(fn: (value: any) => void): this;

  /**
   * Register the error handler for this interceptor.
   * - If successfully catched and handled, the result will be passed to the next interceptor.
   * - If not handled or catcher function throws another error, the interception process will be stopped and enter the filter process.
   */
  catch(fn: (error: any) => any): this;
}

/**
 * You must override the `intercept` method in your custom interceptor class.
 */
export interface NestifyInterceptorLike {
  /**
   * Called when entering the controller method
   * @param context like in NestJS, it can `.switchToHttp()` and get `request` and `reply` object
   * @returns returned function will be called when leaving the controller method
   */
  intercept(context: ExecutionContext, next: InterceptorNextHandlerLike): OrPromise<InterceptorNextHandlerLike>;
}

/**
 * You must override the `transform` method in your custom pipe class.
 */
export interface NestifyPipeLike {
  /**
   * Like transform in NestJS Pipe, validation and transformation are done here
   *
   * @param context like in NestJS, it can `.switchToHttp()` and get `request` and `reply` object
   * @param input comes from last pipe's return value, or `undefined` if it's the first
   * @param schema validation schema, if provided in the pipe options
   * @returns returned value will be passed to the next pipe. The last pipe's return value will be passed to the controller.
   */
  transform(context: ExecutionContext, input: any[], schema: PipeFullSchema): OrPromise<any[]>;
}

/**
 * You must override the `catch` method in your custom filter class.
 */
export interface NestifyFilterLike {
  /**
   * @param context like in NestJS, it can `.switchToHttp()` and get `request` and `reply` object
   * @param exception catched exception
   */
  catch(context: ExecutionContext, exception: unknown): OrPromise;
}

export type NestifyMiddleware = NestifyInterceptorLike | NestifyGuardLike | NestifyFilterLike | NestifyPipeLike;

// & Middleware tasks
export type GuardTask = NestifyGuardLike['canActivate'];
export type PipeTask = NestifyPipeLike['transform'];
export type InterceptorTask = NestifyInterceptorLike['intercept'];
export type FilterTask = NestifyFilterLike['catch'];
