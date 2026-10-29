import type { PipeSchema, PipeFullSchema } from '@core/types/middleware.js';
import { UsePipes } from '@core/decorators/middlewares/pipe.js';
import { _assign } from '@nestify-js/shared';

import { PipeBody } from '../pipes/body.pipe.js';
import { PipeParams } from '../pipes/params.pipe.js';
import { PipeQuery } from '../pipes/query.pipe.js';
import { PipeIp } from '../pipes/ip.pipe.js';
import { PipeRaw } from '../pipes/raw.pipe.js';

function mergeSchema(
  field: 'body' | 'params' | 'querystring',
  input?: PipeSchema,
  ok?: PipeSchema,
  other?: PipeFullSchema,
) {
  const o = {} as { body?: unknown; params?: unknown; querystring?: unknown; response?: unknown };
  if (input !== undefined) {
    o[field] = input;
  }
  if (ok !== undefined) {
    o.response = { 200: ok };
  }
  return _assign(o, other);
}

/**
 * Decorated method will be called with `handler(request.body, reply)
 * - `fastify.setValidatorCompiler` will be used for validation
 * - **Attention** this decorator will ignore the last pipe's return value, force to extract the value from `request` object.
 * @param input The pipe will validate `body` against this schema, using `fastify.setValidatorCompiler`
 * - Only the schema of the **FIRST** `PipeOption` will be mounted to `schema.body` to provide swagger info
 * @param ok will be set to `{ response: { 200: okSchema } }`
 * @param other Additional schema such as `response`; unrelated request schemas are rejected.
 */
export function Body(input?: PipeSchema, ok?: PipeSchema, other?: PipeFullSchema) {
  return UsePipes({ pipe: PipeBody, schema: mergeSchema('body', input, ok, other) });
}

/**
 * Decorated method will be called with `handler(request.params, reply)
 * - `fastify.setValidatorCompiler` will be used for validation
 * - **Attention** this decorator will ignore the last pipe's return value, force to extract the value from `request` object.
 * @param input The pipe will validate `params` against this schema, using `fastify.setValidatorCompiler`
 * - Only the schema of the **FIRST** `PipeOption` will be mounted to `schema.params` to provide swagger info
 * @param ok will be set to `{ response: { 200: okSchema } }`
 * @param other Additional schema such as `response`; unrelated request schemas are rejected.
 */
export function Params(input?: PipeSchema, ok?: PipeSchema, other?: PipeFullSchema) {
  return UsePipes({ pipe: PipeParams, schema: mergeSchema('params', input, ok, other) });
}

/**
 * Decorated method will be called with `handler(request.query, reply)
 * - `fastify.setValidatorCompiler` will be used for validation
 * - **Attention** this decorator will ignore the last pipe's return value, force to extract the value from `request` object.
 * @param input The pipe will validate `query` against this schema, using `fastify.setValidatorCompiler`
 * - Only the schema of the **FIRST** `PipeOption` will be mounted to `schema.querystring` to provide swagger info
 * @param ok will be set to `{ response: { 200: okSchema } }`
 * @param other Additional schema such as `response`; unrelated request schemas are rejected.
 */
export function Query(input?: PipeSchema, ok?: PipeSchema, other?: PipeFullSchema) {
  return UsePipes({ pipe: PipeQuery, schema: mergeSchema('querystring', input, ok, other) });
}

/**
 * Decorated method will be called with `handler(request.raw, reply)
 * - **Attention** this decorator will ignore the last pipe's return value, force to extract the value from `request` object.
 */
export function Raw() {
  return UsePipes({ pipe: PipeRaw });
}

/**
 * Decorated method will be called with `handler(request.ip, reply)
 * - **Attention** this decorator will ignore the last pipe's return value, force to extract the value from `request` object.
 */
export function Ip() {
  return UsePipes({ pipe: PipeIp });
}
