// router decorators
export { Delete, Get, Patch, Post, Put, HttpMethod } from './decorators/router/http-methods.js';
export { Opt } from './decorators/router/opt.js';
export { ApiSchema } from './decorators/router/api-schema.js';
export { Controller } from './decorators/router/controller.js';

export { Inject } from './decorators/inject.js';
export { Injectable } from './decorators/injectable.js';
export { Module, toModule } from './decorators/module.js';
export { createDecorator, getClassMetadata, getMethodMetadata } from './decorators/custom.js';

import { sym } from '@nestify-js/shared';

/**
 * ## Use it with caution!
 *
 * Symbol for storing metadata on classes and methods.
 *
 * It's actually `Symbol.metadata` when setting `target:"ESNext"` in tsconfig.json.
 * @see https://github.com/tc39/proposal-decorator-metadata
 */
export const SymbolMetadata = sym.metadata;

// middlewares
export { Guard } from './decorators/middlewares/guard.js';
export { Interceptor } from './decorators/middlewares/interceptor.js';
export { Pipe } from './decorators/middlewares/pipe.js';
export { Filter } from './decorators/middlewares/filter.js';

export { UseGuards } from './decorators/middlewares/guard.js';
export { UseInterceptors } from './decorators/middlewares/interceptor.js';
export { UsePipes } from './decorators/middlewares/pipe.js';
export { UseFilters } from './decorators/middlewares/filter.js';
export { NestifyGuard, NestifyInterceptor, NestifyPipe, NestifyFilter } from './types/middleware.js';
export type { PipeSchema, PipeFullSchema, PipeOptions, RouteApiSchema } from './types/middleware.js';

export type { NestifyOptions } from '@core/types/index.js';

export type {
  FastifyRequest as NestifyRequest,
  FastifyReply as NestifyReply,
  FastifyInstance as NestifyInstance,
} from 'fastify';

// export common exceptions for use
export * from './exceptions/index.js';
export { ExecutionContext } from './common/execution-context.js';

// creator
export { apply, nestify } from './register/index.js';
export type { NestifyBootOptions, NestifyPluginRegistration } from './register/nestify.js';

// multipart/file upload support (requires @fastify/multipart peer dependency)
export { File, Files, PipeFile, UploadedFile } from './multipart/index.js';
export type { MultipartFile, FileUploadOptions, FileUploadMeta } from './types/multipart.js';

// JWT authentication support
export { jwt, JwtService, JwtGuard } from './auth/index.js';
export type { JwtPayload, JwtSignOptions, JwtVerifyOptions, JwtModuleOptions } from './types/auth.js';

// preset pipe decorators
export { Body, Params, Query, Raw, Ip } from './decorators/pipes.js';

// preset pipe classes
export { PipeBody } from './pipes/body.pipe.js';
export { PipeParams } from './pipes/params.pipe.js';
export { PipeQuery } from './pipes/query.pipe.js';
export { PipeIp } from './pipes/ip.pipe.js';
export { PipeRaw } from './pipes/raw.pipe.js';
export { isBasicPipe } from './pipes/is-basic-pipe.js';
export type { NestifyHttpPart } from './pipes/basic-transformer.js';

// validation engine
export { BasicTransformer, basicTransformer } from './pipes/basic-transformer.js';
