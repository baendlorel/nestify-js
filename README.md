# Nestify

[![npm version](
https://img.shields.io/npm/v/nestify-js.svg)](https://www.npmjs.com/package/nestify-js) [![npm downloads](http://img.shields.io/npm/dm/nestify-js.svg)](https://npmcharts.com/compare/nestify-js,token-types?start=1200&interval=30)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Codacy Badge](https://api.codacy.com/project/badge/Grade/59dd6795e61949fb97066ca52e6097ef)](https://www.codacy.com/app/Borewit/nestify-js?utm_source=github.com&utm_medium=referral&utm_content=Borewit/nestify-js&utm_campaign=Badge_Grade)

[中文版本 README.zh.md](./README.zh.md)

> ⚠️ **Warning**: This is not an official release version. APIs may change in the future.

**Nestify** is a NestJS-like dependency injection framework for Fastify, built on the Stage 3 decorator specification instead of the legacy experimental decorators used by NestJS.

## Installation

```bash
pnpm add nestify-js
```

> Note: it is recommended to set `"strictPropertyInitialization": false` in your tsconfig.json to avoid linting issues with property injection.

## Quick Start

```typescript
import {
  Module, Controller, Injectable, Inject,
  Get, Post, Body, Params,
  nestify,
} from 'nestify-js';

@Injectable()
class UserService {
  private users = [{ id: 1, name: 'Alice' }];

  getUsers() {
    return this.users;
  }

  createUser(body: { name: string }) {
    const user = { id: Date.now(), ...body };
    this.users.push(user);
    return user;
  }
}

@Controller('/api/users')
class UserController {
  @Inject(UserService)
  userService: UserService;

  @Get('/')
  getUsers() {
    return this.userService.getUsers();
  }

  @Get('/:id')
  @Params({ type: 'object', properties: { id: { type: 'number' } }, required: ['id'] })
  getUser(params: { id: number }) {
    return this.userService.getUsers().find((u) => u.id === params.id);
  }

  @Post('/')
  @Body({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] })
  createUser(body: { name: string }) {
    return this.userService.createUser(body);
  }
}

@Module({
  providers: [UserService],
  controllers: [UserController],
})
class AppModule {}

await nestify(AppModule, {
  logger: true,
  listen: true, // uses the `PORT` / `HOST` env vars, defaults to 3000 / 0.0.0.0
});
```

## Routes

### HTTP Method Decorators

`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete` define routes on controller methods; `HttpMethod(method)` covers the rest:

```typescript
import { Controller, Get, Post, HttpMethod } from 'nestify-js';

@Controller('/api') // route prefix, optional
class UserController {
  @Get('/users')
  getUsers() {
    return { users: [] };
  }

  @Post('/users')
  createUser() {
    return { message: 'User created' };
  }

  @(HttpMethod('OPTIONS')('/users'))
  optionsUsers() {
    return { methods: ['GET', 'POST'] };
  }
}
```

### Route Options

- `@ApiSchema({ summary, description, tags, ... })` — OpenAPI/Swagger schema information.
- `@Opt(options)` — additional Fastify route options (e.g. `{ bodyLimit: 1048576 }`).

```typescript
@Controller('/files')
class FileController {
  @Post('/upload')
  @ApiSchema({ summary: 'Upload a file', tags: ['files'] })
  @Opt({ bodyLimit: 1048576 })
  uploadFile() {
    return { uploaded: true };
  }
}
```

## Dependency Injection

```typescript
@Injectable() // marks a class as injectable
class UserService {}

@Module({
  imports: [DatabaseModule],          // other modules
  providers: [UserService],           // services of this module
  controllers: [UserController],      // controllers of this module
  exports: [UserService],             // providers visible to importing modules
})
class UserModule {}

@Injectable()
class UserController {
  @Inject(UserService)       // inject by class
  userService: UserService;

  @Inject('DATABASE_URL')    // or by string/symbol token
  databaseUrl: string;
}
```

Modules can import other modules and use their exported providers. Circular dependencies are allowed inside one module; set `allowCrossModuleCircularReference: true` in the boot options to allow them across modules. Providers are singletons **per app instance** — see [Multiple Instances](#multiple-instances).

## Middleware

There are four kinds of middleware: **Guards**, **Interceptors**, **Pipes** and **Filters**. Custom middleware classes must extend `NestifyGuard` / `NestifyInterceptor` / `NestifyPipe` / `NestifyFilter` and be registered in some module's `providers` (or via `useGlobalXXX`, see below). They are `Injectable`, so `@Inject` works inside them.

Execution order of a single request:

```
Request → Guard → Interceptor(enter) → Pipe → Controller method → Interceptor(leave) → Response
            └──────────────────── Unhandled exception → Filter ────────────────────┘
```

Middlewares can be applied with `@UseGuards` / `@UseInterceptors` / `@UsePipes` / `@UseFilters` on a **controller class** (all routes) or on a **method** (that route only). Same-kind middlewares run in order: global → controller → method.

All middlewares receive an `ExecutionContext`:

```typescript
const http = context.switchToHttp();
http.getRequest<FastifyRequest>(); // fastify request object
http.getReply<FastifyReply>();     // fastify reply object
context.getClass();                // current controller class
context.getHandler();              // current handler method
```

### Guards

Returning `false` or throwing from `canActivate` aborts the request:

```typescript
@Guard()
class AuthGuard extends NestifyGuard {
  @Inject(AuthService)
  authService: AuthService;

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    return request.headers.authorization === 'Bearer valid-token';
    // or throw new UnauthorizedException() for a specific error
  }
}

@Module({ controllers: [AdminController], providers: [AuthGuard] }) // must be registered
class AdminModule {}

@Controller('/admin')
@UseGuards(AuthGuard)               // controller level
class AdminController {
  @Get('/dashboard')
  getDashboard() {
    return { data: 'sensitive' };
  }

  @Get('/stats')
  @UseGuards(AnotherGuard)          // method level, runs after controller-level guards
  getStats() {
    return { data: 'stats' };
  }
}
```

### Interceptors

An interceptor receives `(context, next)` and must return `next`. Map the response or handle errors with its chainable `.map()` / `.catch()`:

```typescript
@Interceptor()
class LoggingInterceptor extends NestifyInterceptor {
  intercept(context: ExecutionContext, next: NestifyInterceptorNextHandler) {
    const start = Date.now();

    return next
      .map((result: any) => {
        // runs on the way out: method → controller → global
        return { data: result, elapsed: Date.now() - start };
      })
      .catch((error: unknown) => {
        // recover by returning a value, or rethrow to continue the failure
        throw error;
      });
  }
}

@Controller('/api')
@UseInterceptors(LoggingInterceptor)
class ApiController {
  @Get('/data')
  getData() {
    return { value: 'example' };
  }
}
```

- Interceptors enter in registration order (global → controller → method); their `.map()` callbacks run in reverse order.
- Each `.map()` receives the current result and its return value is passed to the next outer interceptor, finally used as the response.

### Pipes

Pipes validate and transform input data; each pipe's return value becomes the next pipe's `input`. Validation is based on Fastify's `validatorCompiler`.

```typescript
@Pipe()
class TrimPipe extends NestifyPipe {
  async transform(context: ExecutionContext, input: any[], schema?: PipeFullSchema) {
    return input.map((v) => (typeof v === 'string' ? v.trim() : v));
  }
}

@Controller('/users')
@UsePipes(TrimPipe) // also works without a schema (transformation only)
class UserController {
  @Post('/')
  @UsePipes({ pipe: TrimPipe, schema: { body: { type: 'object', required: ['name'] } } })
  createUser() {
    // ...
  }
}
```

**Preset pipes** extract data from the `request` object and pass it to the handler. They are auto-registered — just use the decorators:

```typescript
@Controller('/users')
class UserController {
  @Post('/')
  @Body({ type: 'object', required: ['name', 'email'] }) // schema also feeds swagger
  createUser(body: any) {
    return { user: body };        // handler receives request.body
  }

  @Get('/')
  @Query({ type: 'object' })
  getUsers(query: any) {
    return { query };             // handler receives request.query
  }

  @Get('/:id')
  @Params({ type: 'object', required: ['id'] })
  getUser(params: any) {
    return { id: params.id };     // handler receives request.params
  }

  @Get('/ip')
  getIp(ip: string) {
    return { ip };                // @Ip: handler receives request.ip
  }

  @Post('/raw')
  handleRaw(raw: any) {
    return { received: true };    // @Raw: handler receives request.raw
  }
}
```

> **Note**: `@Body` / `@Query` / `@Params` / `@Ip` / `@Raw` ignore the previous pipe's return value and always extract from the `request` object. When chaining pipes, put them last or handle the data yourself in a custom pipe.

### Filters

Filters handle exceptions thrown by routes. Specify the exception classes to catch in the decorator (omit to catch all):

```typescript
@Filter(HttpException)
class HttpExceptionFilter extends NestifyFilter {
  catch(context: ExecutionContext, exception: HttpException) {
    const response = context.switchToHttp().getReply();
    response.status(exception.status).send({
      error: exception.message,
      timestamp: new Date().toISOString(),
    });
  }
}

@Controller('/api')
@UseFilters(HttpExceptionFilter)
class ApiController {
  @Get('/error')
  throwError() {
    throw new HttpException('Something went wrong', 400);
  }
}
```

### Global Middleware

Apply middleware globally with the boot options — classes listed there are instantiated and applied automatically, no `providers` registration needed:

```typescript
await nestify(AppModule, {
  useGlobalGuards: [AuthGuard],
  useGlobalInterceptors: [LoggingInterceptor],
  useGlobalPipes: [ValidationPipe],
  useGlobalFilters: [HttpExceptionFilter],
});
```

Alternatively, register the `APP_GUARD` / `APP_INTERCEPTOR` / `APP_PIPE` / `APP_FILTER` tokens as providers; each of these tokens can only be registered once per app:

```typescript
@Module({
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
class AppModule {}
```

### Built-in JWT Guard

`JwtGuard` ships auto-registered (no need to add it to providers). It verifies the token from `Authorization: Bearer <token>` and attaches the decoded payload to the request:

```typescript
import { JwtGuard, JwtService, jwt } from 'nestify-js';

// `jwt` is the default JwtService instance; pass your own via JwtGuard(myJwt)
@Controller('protected')
@UseGuards(JwtGuard())
class ProtectedController {
  @Get('profile')
  async getProfile(request: any) {
    return request;
  }
}
```

## Cron Jobs

Decorate methods of an `@Injectable` provider with `@Cron(expression, uid?)`. Jobs are bound during bootstrap and **start automatically** once all modules are registered:

```typescript
import { Cron, CronExpressions } from 'nestify-js';

@Injectable()
class ScheduledTasks {
  @Cron(CronExpressions.EVERY_30_SECONDS)
  tick() {
    // ...
  }

  @Cron('0 0 * * *', 'daily-report') // uid is optional, needed for start/stop
  dailyReport() {
    // ...
  }
}

@Module({ providers: [ScheduledTasks] })
class AppModule {}
```

Errors thrown (or promises rejected) by a job are logged through the app logger; the schedule continues. Long intervals beyond Node's `setTimeout` cap (~24.8 days) are handled automatically, and all jobs are cleared on `app.close()`.

Control jobs through the app instance:

```typescript
app.getCronJobStates();    // [{ uid, expression, nextTime, running }]
app.stopCronJob('daily-report');
app.startCronJob('daily-report');
app.launchCronJobs();      // (re)start every non-running job; idempotent
```

## Multiple Instances

Every `nestify()` / `apply()` call creates a fully isolated application: its own injector, provider singletons, global middleware collections and cron jobs. The same module tree can therefore be mounted on several apps at once, e.g. for testing or multi-tenant setups:

```typescript
const [first, second] = await Promise.all([
  nestify(AppModule),
  nestify(AppModule),
]);

// each app has its own injector, collection and provider singletons
first.injector !== second.injector;
first.injector.get(UserService) !== second.injector.get(UserService);

await first.inject({ method: 'GET', url: '/api/users' }); // served by `first`'s instances
await first.close();
await second.close();
```

## Custom Decorators and Metadata

`createDecorator(key)` creates a Stage 3 class/method decorator that stores custom metadata:

```typescript
const Roles = createDecorator<string[]>('roles');

@Roles(['admin'])
@Controller('/admin')
class AdminController {
  @Get('/audit')
  @Roles(['auditor'])
  getAuditLog() {
    // ...
  }
}

@Guard()
class RolesGuard extends NestifyGuard {
  canActivate(context: ExecutionContext) {
    const controller = context.getClass();
    const handler = context.getHandler();
    const roles =
      getMethodMetadata<string[]>(controller, handler.name, 'roles') ??
      getClassMetadata<string[]>(controller, 'roles');

    const currentRole = 'admin'; // read this from the authenticated request or a service
    return !roles?.length || roles.includes(currentRole);
  }
}
```

Available helpers:

- `createDecorator<T>(key)` — creates a decorator usable on classes and methods.
- `getClassMetadata<T>(controller, key)` / `getMethodMetadata<T>(controller, methodName, key)` — read metadata.
- `setClassMetadata(context, key, value)` / `setMethodMetadata(context, key, value)` — write metadata from a custom Stage 3 decorator implementation.
- `SymbolMetadata` — the low-level Stage 3 metadata symbol for advanced use; prefer the helpers above.

## Application Bootstrap

### `nestify(rootModule, options?)` (recommended)

Creates the fastify instance, registers fastify plugins, applies all modules and (optionally) starts listening — all in one call. Returns the underlying fastify instance.

```typescript
const app = await nestify(AppModule, {
  logger: { level: 'info' },

  // fastify plugins registered before modules are applied
  plugins: [
    [multipart, { limits: { fileSize: 10 * 1024 * 1024 } }],
    [staticFiles, { root: './public', prefix: '/' }],
  ],

  listen: true, // or listen: { port: 8080, host: 'localhost' }
});
```

| Option                              | Type                                       | Description                                                                                                             |
| ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `logger`                            | `FastifyServerOptions['logger']`           | Shortcut for `fastify.logger`                                                                                           |
| `fastify`                           | `FastifyServerOptions`                     | Options passed to the fastify factory (`fastify(options)`)                                                              |
| `ignoreTrailingSlash`               | `boolean`                                  | Treat `/path/` and `/path` as the same route. `@default true`                                                           |
| `plugins`                           | `readonly [plugin, options?][]`            | Fastify plugins registered before modules are applied                                                                   |
| `listen`                            | `boolean \| Partial<FastifyListenOptions>` | Start listening after all modules are registered; `true` uses `PORT` / `HOST` env vars (falling back to 3000 / 0.0.0.0) |
| `allowCrossModuleCircularReference` | `boolean`                                  | Must be `true` to allow **cross-module** circular dependencies (same-module ones are always allowed). `@default false`  |
| `registerGlobalMiddlewares`         | `ProviderOptions[]`                        | Middlewares to instantiate without applying globally (built-in pipes and `JwtGuard` are prepended automatically)        |
| `useGlobalGuards`                   | `ProviderOptions[]`                        | Applied globally, in array order: global → controller → method                                                          |
| `useGlobalInterceptors`             | `ProviderOptions[]`                        | Applied globally, in array order: global → controller → method → controller → global                                    |
| `useGlobalPipes`                    | `ProviderOptions[]`                        | Applied globally, in array order: global → controller → method                                                          |
| `useGlobalFilters`                  | `ProviderOptions[]`                        | Applied globally as the bottom filters                                                                                  |

### `apply(app, options)`

If you need more control over the fastify instance (custom plugins, hooks, decorators...), create it yourself and use the lower-level `apply()`:

```typescript
import fastify from 'fastify';
import { apply, type NestifyInstance } from 'nestify-js';

// `apply()` requires a `NestifyInstance`, because it installs the cron methods
// on it while registering modules
const app = fastify({ logger: true }) as NestifyInstance;

await apply(app, { rootModule: AppModule });

app.getCronJobStates(); // available after apply(); cron jobs have started
await app.listen({ port: 3000 });
```

## Features

- ✅ Modern Stage 3 decorators
- ✅ Dependency injection with circular dependency support
- ✅ HTTP method decorators (GET, POST, PUT, PATCH, DELETE, ...)
- ✅ Route parameters, query, and body validation
- ✅ Guards, interceptors, pipes and exception filters
- ✅ Global middleware via boot options or `APP_*` tokens
- ✅ Module system with imports/exports
- ✅ Built-in cron scheduler with runtime control
- ✅ Fully isolated multiple app instances
- ✅ OpenAPI/Swagger schema support and built-in HTTP exceptions
- ✅ File upload (`@fastify/multipart`) and JWT authentication built in

## License

MIT
