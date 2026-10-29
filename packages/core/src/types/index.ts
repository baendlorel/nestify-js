import type {
  ContextConfigDefault,
  FastifyBaseLogger,
  FastifySchema,
  FastifyTypeProvider,
  FastifyTypeProviderDefault,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerBase,
  RawServerDefault,
  RouteGenericInterface,
  RouteShorthandOptions,
} from 'fastify';
import type { SSKey } from '@nestify-js/shared';
import { sym } from '@nestify-js/shared';

export * from './auth.js';
export * from './injection.js';

export type RouteOptType<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
  Logger extends FastifyBaseLogger = FastifyBaseLogger,
  RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
  ContextConfig = ContextConfigDefault,
  SchemaCompiler extends FastifySchema = FastifySchema,
> = RouteShorthandOptions<
  RawServer,
  RawRequest,
  RawReply,
  RouteGeneric,
  ContextConfig,
  SchemaCompiler,
  TypeProvider,
  Logger
>;

export interface RouteBasic {
  field: SSKey;
  method: string;
  route: string[];
}

export interface RouteConfig {
  [sym.route.base]: RouteBasic;
  [sym.route.opt]?: RouteOptType;
  [sym.route.args]?: string[][];
}
