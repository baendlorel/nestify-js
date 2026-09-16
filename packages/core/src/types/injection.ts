/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HttpStatus } from '@nestify-js/shared';
import type { AnyFunction, Constructor, SSKey } from '@core/types/primitives.js';

import type { FastifyRequest as NestifyRequest } from 'fastify';
import type { NestifyInstance } from '@core/types/instance.js';

export interface BaseHttpException {
  readonly message: string;
  readonly statusCode: HttpStatus;
  readonly error: string;
  getResponse(): {
    statusCode: HttpStatus;
    error: string;
    message: string;
  };
}

export type DataKeys<T> = {
  [K in keyof T]: T[K] extends AnyFunction ? never : K;
}[keyof T];

export type FastifyRequestDataKeys = Exclude<DataKeys<NestifyRequest>, undefined>;

export type ArgExtractionPath = FastifyRequestDataKeys | `${FastifyRequestDataKeys}.${string}`;

export type InjectToken = SSKey | Constructor;

export type InjectArg = InjectToken | (() => Constructor);

export interface ProviderUseFactory {
  /**
   * The unique token used to identify and inject this provider.
   */
  provide: SSKey;

  /**
   * Provide via factory function.
   * - If `inject` is provided, it will be injected into the factory function.
   *   - When `inject` = `[MyClass1, 'token1']`, the factory will be called as `useFactory(myClass1, instanceOfToken1)`.
   */
  useFactory: (...instances: any[]) => any;

  inject?: (Constructor | SSKey)[];
}

export interface ProviderUseValue {
  /**
   * The unique token used to identify and inject this provider.
   */
  provide: SSKey;

  /**
   * Directly provide a value. No dependency injection is performed.
   * If dependencies are needed, the factory must inject them manually.
   */
  useValue: any;
}

export interface ProviderUseClass {
  /**
   * The unique token used to identify and inject this provider.
   */
  provide: SSKey;

  /**
   * Provide via class. Managed by Nestify, dependencies are automatically injected.
   */
  useClass: Constructor;
}

export interface ProviderUseExisting {
  /**
   * The unique token used to identify and inject this provider.
   */
  provide: SSKey;

  /**
   * Provide by referencing an existing provider. No chain lookup; only the referenced provider is used.
   */
  useExisting: SSKey;
}

export type ProviderStandardOptions = ProviderUseFactory | ProviderUseValue | ProviderUseClass | ProviderUseExisting;

export type ProviderOptions = ProviderStandardOptions | Constructor;

export interface DynamicModule {
  moduleClass: Constructor;

  /**
   * When "true", makes a module global-scoped.
   *
   * Once imported into any module, a global-scoped module will be visible
   * in all modules. Thereafter, modules that wish to inject a service exported
   * from a global module do not need to import the provider module.
   *
   * @default false
   */
  isGlobal?: boolean;
}

export interface NestifyOptions {
  rootModule: Constructor;

  /**
   * Nestify naturally allows circular references, but:
   * - Providers declared in the same module are allowed by default
   * - **Must set to `true`** to allow cross-module circular dependencies
   * @default false
   */
  allowCrossModuleCircularReference: boolean;

  /**
   * Middlewares listed here are no need to be registered in `@Module({providers:[...]})` manually.
   * - Only register, you can use them as you want.
   * - If you want to apply middlewares globally, use `useGlobalXXX` options.
   * - Built-in pipes and guard are prepended automatically.
   *
   * @default []
   */
  registerGlobalMiddlewares?: ProviderOptions[];

  /**
   * This will be the bottom filter of all filters
   * - Automatically applied globally
   *
   * @default []
   */
  useGlobalFilters?: ProviderOptions[];

  /**
   * Execute order: global → controller → route
   * - Automatically applied globally, in array order
   *
   * @default []
   */
  useGlobalPipes?: ProviderOptions[];

  /**
   * Execute order: global → controller → route → controller → global
   * - Automatically applied globally, in array order
   *
   * @default []
   */
  useGlobalInterceptors?: ProviderOptions[];

  /**
   * Execute order: global → controller → route
   * - Automatically applied globally, in array order
   *
   * @default []
   */
  useGlobalGuards?: ProviderOptions[];
}

export interface LazyInjectEntry {
  provide: SSKey;
  propertyKey: SSKey;
  dependency: InjectArg;
}

export interface InjectMetadata {
  /**
   * When using `@Inject(token)` to decorate a class field
   *
   * `token` is stored there
   */
  dependency: InjectArg;
}

export interface ControllerMeta {
  prefix: string[];
}

export interface ProviderMeta {
  /**
   * !Not supported yet
   * @todo
   */
  args: any[];
}

export interface ModuleMeta {
  /**
   * Services provided by this module
   */
  readonly providers: ProviderOptions[];

  /**
   * Controllers declared in this module
   */
  readonly controllers: Constructor[];

  /**
   * ! Only modules can be imported. After importing, providers in this module can import services from other modules.
   *
   * Import other modules
   * - Must be classes decorated with `@Module`
   */
  readonly imports: (Constructor | DynamicModule)[];

  /**
   * ! Controllers cannot be exported
   *
   * Export services to other modules
   * - These are classes decorated with `@Injectable`
   */
  readonly exports: Constructor[];

  /**
   * Prefix applied to each controller
   * - will inherit from the parent module
   */
  readonly prefix: string;

  readonly outer: boolean;

  /**
   * `app` is used to append global providers to the accessible provider tokens list.
   */
  getAccessibleProviderTokens(app: NestifyInstance): SSKey[];
}

export interface InheritedModuleMeta {
  readonly prefix: string[];
}
