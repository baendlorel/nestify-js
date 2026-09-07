/**
 * Property keys used to store metadata.
 */
export namespace sym {
  /**
   * Polyfill for stage2 proposal: Symbol.metadata.
   * - obj[Symbol.metadata] stores metadata for decorators.
   * @see https://github.com/tc39/proposal-decorator-metadata
   */
  export const metadata = Symbol.metadata ?? Symbol.for('Symbol.metadata');

  /**
   * A symbol means no value or absence of a meaningful value.
   * - Distinguishes from `undefined` or `null` which might be meaningful values.
   */
  export const none = Symbol('none');

  /**
   * Used for nestify framework to mark the root of the metadata
   */
  export const root = Symbol('nestify-root');

  /**
   * Stores the `module` information.
   */
  export const module = Symbol('module');

  /**
   * Stores the `provider` information.
   */
  export const provider = Symbol('provider');

  /**
   * Stores the `controller` information.
   */
  export const controller = Symbol('controller');

  /**
   * Stores injection information for fields.
   * - This is used to inject dependencies into fields of a class.
   * - The value is an object with the dependency class and other metadata.
   */
  export const injection = Symbol('injection');

  export namespace route {
    /**
     * Stores route metadata
     */
    export const root = Symbol('route');
    /**
     * Stores basic route options with interface `RouteBasic`
     */
    export const base = Symbol('base');

    /**
     * Stores route options of `fastify.route(opts)`
     * - Priority: `opts.schema` < `Symbol(RouteApiSchema)` < `@Pipe({ schema })`
     */
    export const opt = Symbol('opt');

    /**
     * Stores info schema like `summary`, `description`, etc. for swagger
     * - Priority: `opts.schema` < `Symbol(RouteApiSchema)` < `@Pipe({ schema })`
     */
    export const apiSchema = Symbol('apiSchema');

    /**
     * Stores property paths of the handler argument `request: FastifyRequest`
     * - if the handler is decorated by `@Args('body.name','body.age')`, then the handler will be called as `handler(request.body.name, request.body.age, reply)`
     * - `reply` will always be the last argument
     */
    export const args = Symbol('args');
  }

  export namespace interceptor {
    /**
     * Identify this class as an interceptor
     */
    export const root = Symbol('interceptor');
    /**
     * Stores interceptors with controller level
     */
    export const controller = Symbol('controller');

    /**
     * Stores interceptors with handler level
     */
    export const handler = Symbol('handler');
  }

  export namespace guard {
    /**
     * Identify this class as a guard
     */
    export const root = Symbol('guard');

    /**
     * Stores guards with controller level
     */
    export const controller = Symbol('controller');

    /**
     * Stores guards with handler level
     */
    export const handler = Symbol('handler');
  }

  export namespace filter {
    /**
     * Identify this class as a filter
     */
    export const root = Symbol('filter');

    /**
     * Stores filters with controller level
     */
    export const controller = Symbol('controller');

    /**
     * Stores filters with handler level
     */
    export const handler = Symbol('handler');
  }

  export namespace pipe {
    /**
     * Identify this class as a pipe
     */
    export const root = Symbol('pipe');

    /**
     * Stores pipes with controller level
     */
    export const controller = Symbol('controller');

    /**
     * Stores pipes with handler level
     */
    export const handler = Symbol('handler');
  }

  export namespace custom {
    /**
     * Custom metadata stored in this field
     */
    export const root = Symbol('custom');

    /**
     * Custom metadata stored in this field
     */
    export const method = Symbol('method');

    /**
     * Custom metadata stored in this field
     */
    export const field = Symbol('field');
  }

  export const cron = Symbol('cron');

  /**
   * Stores file upload metadata for multipart/form-data
   */
  export const file = Symbol('file');

  /**
   * Stores authenticated user on FastifyRequest
   * - Used by authentication guards to attach user info to request
   */
  export const user = Symbol('user');
}
