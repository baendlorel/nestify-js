import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FastifySchemaValidationError, FastifyValidationResult as Validator } from 'fastify/types/schema.js';
import AjvCompiler from '@fastify/ajv-compiler';
import { sym, promiseTry, _isFunction, _isObject, _isArray } from '@nestify-js/shared';
import type { PipeSchema, PipeFullSchema } from '@core/types/middleware.js';
import { ExecutionContext } from '@core/common/execution-context.js';
import { BadRequestException } from '@core/exceptions/index.js';
import { NestifyError } from '@core/asserts/error.js';

export type NestifyHttpPart = 'body' | 'params' | 'query' | 'ip' | 'raw';

type ValidatorReturn = boolean | { value?: unknown; error?: Error | FastifySchemaValidationError[] };
type Compiler = NonNullable<FastifyInstance['validatorCompiler']>;
type ExternalSchema = Parameters<ReturnType<typeof AjvCompiler>>[0][string];

function isExternalSchema(schema: unknown): schema is ExternalSchema {
  return typeof schema === 'boolean' || (typeof schema === 'object' && schema !== null);
}

class BasicTransformer {
  private readonly defaultCompilers = new WeakMap<FastifyInstance, Compiler>();
  // FIXED 内置管道共享此 transformer；按应用、编译器、路由、方法及请求部分隔离缓存，
  // 避免复用其他应用或路由的校验规则，同时使用弱引用避免阻止应用和路由回收。
  private readonly validators = new WeakMap<
    FastifyInstance,
    WeakMap<Compiler, WeakMap<Function, Map<string, Map<PipeSchema, Validator>>>>
  >();

  private getValidator(
    context: ExecutionContext,
    req: FastifyRequest,
    part: 'body' | 'params' | 'querystring',
    schema: PipeSchema,
  ): Validator {
    let compiler = context.validatorCompiler ?? req.server.validatorCompiler;
    if (!_isFunction(compiler)) {
      compiler = this.defaultCompilers.get(req.server);
      if (!compiler) {
        // FIXED 不使用路由上的占位编译器，独立编译器按应用隔离并加载共享 schema。
        if (!_isFunction(req.server.getSchemas)) {
          throw new NestifyError('Cannot initialize the default validator without Fastify schemas');
        }
        const schemas: Record<string, ExternalSchema> = Object.create(null);
        for (const [key, schema] of Object.entries(req.server.getSchemas())) {
          if (!isExternalSchema(schema)) {
            throw new NestifyError(`Invalid shared schema: ${key}`);
          }
          schemas[key] = schema;
        }
        const build = AjvCompiler()(schemas, { customOptions: {} });
        compiler = (definition) => build(definition);
        this.defaultCompilers.set(req.server, compiler);
      }
    }

    const route = req.routeOptions;
    const definition = { schema, method: req.method, url: route?.url ?? req.url, httpPart: part };
    if (!route?.handler) {
      return compiler(definition);
    }

    let byCompiler = this.validators.get(req.server);
    if (!byCompiler) {
      byCompiler = new WeakMap();
      this.validators.set(req.server, byCompiler);
    }
    let byRoute = byCompiler.get(compiler);
    if (!byRoute) {
      byRoute = new WeakMap();
      byCompiler.set(compiler, byRoute);
    }
    let byPart = byRoute.get(route.handler);
    if (!byPart) {
      byPart = new Map();
      byRoute.set(route.handler, byPart);
    }
    const key = `${req.method}:${part}`;
    let bySchema = byPart.get(key);
    if (!bySchema) {
      bySchema = new Map();
      byPart.set(key, bySchema);
    }
    let validator = bySchema.get(schema);
    if (!validator) {
      validator = compiler(definition);
      bySchema.set(schema, validator);
    }
    return validator;
  }

  private handleResult(validator: Validator, result: ValidatorReturn) {
    if (result === true) {
      return sym.none; // Validation passed
    }

    if (validator.errors && validator.errors.length > 0) {
      throw new BadRequestException(validator.errors.map((e) => e.message).join(', '));
    }

    if (result === false) {
      throw new BadRequestException('Validation failed');
    }

    if (result.error instanceof Error) {
      throw new BadRequestException(result.error.message);
    }
    // FIXED 自定义编译器也可以返回错误数组，不能将它误认为校验成功。
    if (_isArray(result.error)) {
      throw new BadRequestException(result.error.map((error) => error.message).join(', '));
    }

    if ('value' in result) {
      return result.value;
    }

    return sym.none; // Validation passed
  }

  private getNeededSchema(httpPart: NestifyHttpPart, schema?: PipeFullSchema) {
    if (schema === undefined) {
      return undefined;
    }
    if (_isObject<PipeFullSchema>(schema)) {
      switch (httpPart) {
        case 'body':
          return 'body' in schema ? schema.body : undefined;
        case 'params':
          return 'params' in schema ? schema.params : undefined;
        case 'query':
          return 'querystring' in schema ? schema.querystring : undefined;
        case 'ip':
        case 'raw':
        default:
          return undefined;
      }
    }
  }

  private async main(context: ExecutionContext, part: NestifyHttpPart, schema?: PipeFullSchema) {
    const req = context.switchToHttp().getRequest();
    const data = req[part];
    const args = [data, context.switchToHttp().getReply()];
    const neededSchema = this.getNeededSchema(part, schema);

    if (neededSchema === undefined || part === 'ip' || part === 'raw') {
      return args;
    }
    const httpPart = part === 'query' ? 'querystring' : part;
    const validator = this.getValidator(context, req, httpPart, neededSchema);

    const rawResult = await promiseTry(validator, null, data);
    const result = this.handleResult(validator, rawResult);
    if (result !== sym.none) {
      args[0] = result; // Update the first argument with the validated data
    }
    return args;
  }

  get transformer(): typeof this.main {
    return (...args) => this.main.apply(this, args);
  }
}

export { BasicTransformer };
export const basicTransformer = new BasicTransformer().transformer;
