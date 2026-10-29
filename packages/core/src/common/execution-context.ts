import type { AnyFunction, Constructor } from '@core/types/primitives.js';
import {
  ArgsTypeMap,
  HttpArgumentsHost,
  ArgsTypeHttp,
  RpcArgumentsHost,
  ArgsTypeRpc,
  WsArgumentsHost,
  ArgsTypeWebSocket,
} from '@core/types/middleware-context.js';
import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * ExecutionContext extends ArgumentsHost to provide reflection metadata
 * (who is the class and handler executing), enabling generic guards/interceptors.
 */
export class ExecutionContext<CT extends keyof ArgsTypeMap = 'http'> {
  constructor(
    private readonly args: ArgsTypeMap[CT],
    private readonly contextType: CT,
    private readonly controller: Constructor,
    private readonly contextHandler: AnyFunction,
  ) {}

  /**
   * Returns an array of original handler arguments.
   */
  getArgs(): ArgsTypeMap[CT] {
    return this.args;
  }

  /**
   * Returns the handler argument at the specified index.
   */
  getArgByIndex<T = unknown>(index: number): T {
    return this.args.at(index) as T;
  }

  /**
   * Switches the context to HTTP and returns request/response/next.
   */
  switchToHttp(): HttpArgumentsHost {
    const args = (this.contextType === 'http' ? this.args : []) as ArgsTypeHttp;
    return {
      getRequest<T = FastifyRequest>(): T {
        return args[0] as T;
      },
      getReply<T = FastifyReply>(): T {
        return args[1] as T;
      },
    };
  }

  /**
   * ! **Not implemented, and no plans in the short term**
   *
   * Switches the context to RPC and returns data/context.
   */
  switchToRpc(): RpcArgumentsHost {
    const args = (this.contextType === 'rpc' ? this.args : []) as ArgsTypeRpc;
    return {
      getData<T = unknown>(): T {
        return args[0] as T;
      },
      getContext<T = unknown>(): T {
        return args[1] as T;
      },
    };
  }

  /**
   * ! **Not implemented, and no plans in the short term**
   *
   * Switches the context to WebSocket and returns client/data.
   */
  switchToWs(): WsArgumentsHost {
    const args = (this.contextType === 'ws' ? this.args : []) as ArgsTypeWebSocket;
    return {
      getClient<T = unknown>(): T {
        return args[0] as T;
      },
      getData<T = unknown>(): T {
        return args[1] as T;
      },
    };
  }

  /**
   * Returns the current context type (e.g., 'http', 'ws', 'rpc', 'graphql').
   */
  getType(): CT {
    return this.contextType;
  }

  /**
   * Returns the controller or provider class handling the request.
   */
  getClass<T = unknown>(): Constructor<T> {
    return this.controller as Constructor<T>;
  }

  /**
   * Returns the handler method that will be executed.
   */
  getHandler(): AnyFunction {
    return this.contextHandler;
  }
}
