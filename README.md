# Nestify

[![npm version](
https://img.shields.io/npm/v/nestify-js.svg)](https://www.npmjs.com/package/nestify-js) [![npm downloads](http://img.shields.io/npm/dm/nestify-js.svg)](https://npmcharts.com/compare/nestify-js,token-types?start=1200&interval=30)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Codacy Badge](https://api.codacy.com/project/badge/Grade/59dd6795e61949fb97066ca52e6097ef)](https://www.codacy.com/app/Borewit/nestify-js?utm_source=github.com&utm_medium=referral&utm_content=Borewit/nestify-js&utm_campaign=Badge_Grade)

[中文版本 README.zh.md](./README.zh.md)

> ⚠️ **Warning**: This is not an official release version. APIs may change in the future.

**Nestify** is a NestJS-like dependency injection framework for Fastify that uses modern Stage 3 decorators instead of the legacy decorators used by NestJS.

This project was created because NestJS uses the old decorator syntax, but we wanted to leverage the new Stage 3 decorator specification for better type safety and modern JavaScript features.

## Installation

```bash
pnpm add nestify-js
```

## API Documentation

Using of decorators looks basically like they are in NestJS, but with modern Stage 3 syntax.

> Note: It is recommended to set "strictPropertyInitialization": false in your tsconfig.json to avoid linting issues when using property injection.

### HTTP Method Decorators

These decorators are used to define HTTP routes on controller methods:

```typescript
import { Get, Post, Put, Patch, Delete, HttpMethod } from 'nestify-js';

@Controller('/api')
class UserController {
  @Get('/users')
  getUsers() {
    return { users: [] };
  }

  @Post('/users')
  createUser() {
    return { message: 'User created' };
  }

  @Put('/users/:id')
  updateUser() {
    return { message: 'User updated' };
  }

  @Patch('/users/:id')
  patchUser() {
    return { message: 'User patched' };
  }

  @Delete('/users/:id')
  deleteUser() {
    return { message: 'User deleted' };
  }

  @(HttpMethod('OPTIONS')('/users'))
  optionsUsers() {
    return { methods: ['GET', 'POST'] };
  }
}
```

### Route Configuration

#### `@Controller(prefix?: string)`

Marks a class as a controller and optionally sets a route prefix:

```typescript
@Controller('/api/v1')
class ApiController {
  @Get('/health')
  health() {
    return { status: 'ok' };
  }
}
// This creates route: GET /api/v1/health
```

#### `@ApiSchema(schema)`

Sets OpenAPI/Swagger schema information for routes:

```typescript
@Controller('/users')
class UserController {
  @Get('/:id')
  @ApiSchema({
    summary: 'Get user by ID',
    description: 'Retrieves a user by their unique identifier',
    tags: ['users'],
  })
  getUser() {
    return { user: {} };
  }
}
```

#### `@Opt(options)`

Sets additional Fastify route options:

```typescript
@Controller('/files')
class FileController {
  @Post('/upload')
  @Opt({
    bodyLimit: 1048576, // 1MB
    attachValidation: true,
  })
  uploadFile() {
    return { uploaded: true };
  }
}
```

### Dependency Injection

#### `@Injectable()`

Marks a class as a service that can be injected:

```typescript
@Injectable()
class UserService {
  getUsers() {
    return [{ id: 1, name: 'John' }];
  }
}
```

#### `@Inject(token)`

Injects dependencies into class properties:

```typescript
@Injectable()
class UserController {
  @Inject(UserService)
  userService: UserService; // here might be linted by typescript, you can set "strictPropertyInitialization": false in tsconfig.json

  @Inject('DATABASE_URL')
  databaseUrl: string;

  getUsers() {
    return this.userService.getUsers();
  }
}
```

#### `@Module(options)`

Defines a module with providers, controllers, imports, and exports:

```typescript
@Module({
  imports: [DatabaseModule],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
class UserModule {}
```

### Custom Decorators and Metadata

`createDecorator(key)` creates a Stage 3 class/method decorator that stores custom metadata. Metadata getters now receive the controller class directly instead of an `ExecutionContext`:

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

    const currentRole = 'admin'; // Read this from the authenticated request or a service
    return !roles?.length || roles.includes(currentRole);
  }
}
```

The available helpers are:

- `createDecorator<T>(key)` — creates a decorator usable on classes and methods.
- `getClassMetadata<T>(controller, key)` — reads class metadata.
- `getMethodMetadata<T>(controller, methodName, key)` — reads method metadata.
- `setClassMetadata(context, key, value)` / `setMethodMetadata(context, key, value)` — write metadata from a custom Stage 3 decorator implementation.
- `SymbolMetadata` — exposes the low-level Stage 3 metadata symbol for advanced use; prefer the helpers above.

### Middleware System

There are four kinds of middleware: **Guards**, **Interceptors**, **Pipes** and **Filters**.

Execution order of a single request:

```
Request → Guard → Interceptor(enter) → Pipe → Controller method → Interceptor(leave) → Response
            └──────────────────── Unhandled exception → Filter ────────────────────┘
```

#### Registration Rules (Important)

- **Built-in middlewares are auto-registered**: the framework's preset pipes (`PipeBody` / `PipeQuery` / `PipeParams` / `PipeIp` / `PipeRaw` / `PipeFile`) and `JwtGuard` are automatically instantiated during `apply()`. They work out of the box, no configuration needed.
- **Custom middlewares must be registered**: like NestJS, classes decorated by `@Guard()` / `@Interceptor()` / `@Pipe()` / `@Filter()` must appear in some module's `providers`, otherwise route registration fails with `Cannot find class for token`.
- **Where to apply**: `@UseGuards` / `@UseInterceptors` / `@UsePipes` / `@UseFilters` can be applied on a **controller class** (affects all its routes) or on a **method** (affects only that route). Middlewares of the same kind run in order: global → controller → method.
- Custom middleware classes must **extend** `NestifyGuard`, `NestifyInterceptor`, `NestifyPipe`, or `NestifyFilter`; the decorators validate the base class at runtime. Middleware classes are also `Injectable`, so `@Inject` property injection works inside them.

#### Guards

Guards control access to routes. Returning `false` or throwing from `canActivate` aborts the request:

```typescript
@Guard()
class AuthGuard extends NestifyGuard {
  // Dependency injection works
  @Inject(AuthService)
  authService: AuthService;

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    return request.headers.authorization === 'Bearer valid-token';
    // Or throw new UnauthorizedException() for a specific error
  }
}

// Must be registered in providers before use
@Module({ controllers: [AdminController], providers: [AuthGuard] })
class AdminModule {}

@Controller('/admin')
@UseGuards(AuthGuard) // Controller level: applies to all routes
class AdminController {
  @Get('/dashboard')
  getDashboard() {
    return { data: 'sensitive' };
  }

  @Get('/stats')
  @UseGuards(AnotherGuard) // Method level: appended after controller-level guards
  getStats() {
    return { data: 'stats' };
  }
}
```

Register a global guard with the `APP_GUARD` token to guard every route (each kind of global middleware can only be registered once):

```typescript
@Module({
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
class AppModule {}
```

#### Interceptors

An interceptor receives `(context, next)` before pipes and the controller method run. It must return `next`; register reverse-phase callbacks with its Promise-like `.then()` and `.catch()` methods:

```typescript
@Interceptor()
class LoggingInterceptor extends NestifyInterceptor {
  intercept(context: ExecutionContext, next: InterceptorNextHandler) {
    const start = Date.now();
    console.log('Request started');

    return next
      .then((result: any) => {
        console.log(`Request completed in ${Date.now() - start}ms`);
        return {
          data: result,
          elapsed: Date.now() - start,
        }; // Passed to the next outer interceptor, then used as the response
      })
      .catch((error: unknown) => {
        console.error('Response mapping failed', error);
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

Important interceptor semantics:

- Interceptors enter in registration order: global → controller → method.
- Their `next.then(...)` callbacks run in reverse order: method → controller → global.
- Each `.then()` receives the current result, and its return value is passed to the next outer interceptor.
- If an interceptor's `.then()` callback throws or rejects, its matching `.catch()` callback can recover by returning a value or continue the failure by throwing.
- `intercept()` must return the provided `next` handler; returning a standalone function is no longer supported.

Global interceptor: `{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }`.

#### Pipes

Pipes validate and transform input data. Each pipe's return value becomes the next pipe's `input`.

**Custom pipes** are applied via `@UsePipes`, optionally with a validation schema (validation is based on fastify's `validatorCompiler`):

```typescript
@Pipe()
class TrimPipe extends NestifyPipe {
  async transform(context: ExecutionContext, input: any[], schema?: PipeFullSchema) {
    // `input` comes from the previous step; the return value goes to the next pipe or the handler
    return input.map((v) => (typeof v === 'string' ? v.trim() : v));
  }
}

@Controller('/users')
@UsePipes(TrimPipe) // Also works without a schema (transformation only)
class UserController {
  @Post('/')
  @UsePipes({
    pipe: TrimPipe,
    schema: { body: { type: 'object', required: ['name'] } }, // PipeOptions: pipe + schema
  })
  createUser() {
    // ...
  }
}
```

**Built-in pipes** (auto-registered, use them directly) extract data from the `request` object and pass it to the handler:

```typescript
@Controller('/users')
class UserController {
  // @Body(schema?, ok?, other?)
  // - schema: JSON Schema to validate request.body
  // - ok: generates the response.200 schema (for swagger)
  // - other: remaining fastify route schema (e.g. headers, response)
  @Post('/')
  @Body({ type: 'object', required: ['name', 'email'] })
  createUser(body: any) {
    return { user: body }; // Handler receives request.body
  }

  @Get('/')
  @Query({ type: 'object' })
  getUsers(query: any) {
    return { query }; // Handler receives request.query
  }

  @Get('/:id')
  @Params({ type: 'object', required: ['id'] })
  getUser(params: any) {
    return { id: params.id }; // Handler receives request.params
  }

  @Get('/ip')
  getUserIP(ip: string) {
    return { ip }; // Handler receives request.ip
  }

  @Post('/raw')
  handleRaw(raw: any) {
    // @Raw(): handler receives request.raw (the raw Node request)
    return { received: true };
  }
}
```

> **Note**: `@Body` / `@Query` / `@Params` / `@Ip` / `@Raw` ignore the previous pipe's return value and always extract from the `request` object. When chaining pipes, put them last or handle the data yourself in a custom pipe.

Global pipe: `{ provide: APP_PIPE, useClass: MyPipe }` (or `{ provide: APP_PIPE, useValue: { pipe: MyPipe, schema: {...} } }`).

#### Filters

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

Global filter: `{ provide: APP_FILTER, useClass: HttpExceptionFilter }`.

#### Built-in JWT Guard

The framework ships with `JwtGuard` (auto-registered, no need to add it to providers). It extracts and verifies the token from `Authorization: Bearer <token>` and attaches the decoded payload to the request:

```typescript
import { JwtGuard, JwtService, jwt } from 'nestify-js';

// `jwt` is the default JwtService instance; you can also pass your own: JwtGuard(myJwt)
@Controller('protected')
@UseGuards(JwtGuard())
class ProtectedController {
  @Get('profile')
  async getProfile(request: any) {
    // The first handler argument is the pipe result; you can also read
    // the request in guards/interceptors via context.switchToHttp().getRequest()
    return request;
  }
}
```

#### ExecutionContext

All middlewares access request information through `context: ExecutionContext`:

```typescript
const http = context.switchToHttp();
const request = http.getRequest<FastifyRequest>(); // fastify request object
const reply = http.getReply<FastifyReply>(); // fastify reply object

context.getClass(); // Current controller class
context.getHandler(); // Current handler method
```

### Application Bootstrap

#### `nestify(rootModule, options?)` (recommended)

Creates the fastify instance, registers fastify plugins, applies all modules and (optionally) starts listening — all in one call. Returns the underlying fastify instance.

```typescript
import { nestify } from 'nestify-js';

const app = await nestify(AppModule, {
  // shortcut for `fastify.logger`
  logger: { level: 'info' },

  // fastify plugins registered before modules are applied
  // - tuple form: `[plugin]` or `[plugin, options]`
  plugins: [
    [multipart, { limits: { fileSize: 10 * 1024 * 1024 } }],
    [staticFiles, { root: './public', prefix: '/' }],
  ],

  // Setup callback to register auto-created instances (optional)
  // - Built-in pipes and JwtGuard are auto-registered, usually not needed

  // start listening after all modules are registered
  // - `true` uses the `PORT` / `HOST` env vars (falling back to 3000 / 0.0.0.0)
  listen: true,
  // or override: listen: { port: 8080, host: 'localhost' }
});
```

Available options:

| Option                              | Type                                             | Description                                                                                                                           |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `logger`                            | `FastifyServerOptions['logger']`                 | Shortcut for `fastify.logger`                                                                                                         |
| `fastify`                           | `FastifyServerOptions`                           | Options passed to the fastify factory (`fastify(options)`)                                                                            |
| `plugins`                           | `readonly [plugin, options?][]`                  | Fastify plugins registered before modules are applied (callback-style and async-style are both accepted)                              |
| `setup`                             | `(register: (cls: Constructor) => void) => void` | Setup callback to register auto-created instances (optional; built-in pipes/JwtGuard are auto-registered, usually not needed)         |
| `listen`                            | `boolean \| Partial<FastifyListenOptions>`       | Start listening after all modules are registered                                                                                      |
| `allowCrossModuleCircularReference` | `boolean`                                        | Must be `true` to allow **cross-module** circular dependencies (same-module circular references are always allowed). `@default false` |

#### `apply(app, options)`

If you need more control over the fastify instance (custom plugins, hooks, decorators...), create it yourself and use the lower-level `apply()` instead:

```typescript
import fastify from 'fastify';
import { apply } from 'nestify-js';

const app = fastify({ logger: true });

await apply(app, { rootModule: AppModule });
await app.listen({ port: 3000 });
```

## Complete Usage Example

```typescript
import {
  Module,
  Controller,
  Injectable,
  Inject,
  Get,
  Post,
  Body,
  Params,
  UseGuards,
  Guard,
  NestifyGuard,
  nestify,
} from 'nestify-js';

// Service
@Injectable()
class UserService {
  private users = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ];

  getUsers() {
    return this.users;
  }

  getUserById(id: number) {
    return this.users.find((user) => user.id === id);
  }

  createUser(userData: { name: string }) {
    const user = { id: Date.now(), ...userData };
    this.users.push(user);
    return user;
  }
}

// Guard
@Guard()
class AuthGuard extends NestifyGuard {
  canActivate(context) {
    // Simple auth check
    const request = context.switchToHttp().getRequest();
    return request.headers.authorization === 'Bearer valid-token';
  }
}

// Controller
@Controller('/api/users')
class UserController {
  @Inject(UserService)
  userService: UserService;

  @Get('/')
  getUsers() {
    return this.userService.getUsers();
  }

  @Get('/:id')
  @Params({
    type: 'object',
    properties: { id: { type: 'number' } },
    required: ['id'],
  })
  getUser(@Params() params: { id: number }) {
    return this.userService.getUserById(params.id);
  }

  @Post('/')
  @UseGuards(AuthGuard)
  @Body({
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  })
  createUser(@Body() body: { name: string }) {
    return this.userService.createUser(body);
  }
}

// Module
@Module({
  providers: [UserService, AuthGuard],
  controllers: [UserController],
})
class AppModule {}

// Application bootstrap
await nestify(AppModule, {
  logger: true,
  listen: true, // uses the `PORT` / `HOST` env vars, defaults to 3000 / 0.0.0.0
});
console.log('Server running on http://localhost:3000');
```

## Features

- ✅ Modern Stage 3 decorators
- ✅ Dependency injection with circular dependency support
- ✅ HTTP method decorators (GET, POST, PUT, PATCH, DELETE)
- ✅ Route parameters, query, and body validation
- ✅ Guards for authentication/authorization
- ✅ Interceptors for request/response transformation
- ✅ Pipes for data transformation and validation
- ✅ Exception filters
- ✅ Module system with imports/exports
- ✅ OpenAPI/Swagger schema support
- ✅ Built-in HTTP exceptions
- ✅ Execution context for middleware

## License

MIT
