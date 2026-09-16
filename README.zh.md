# Nestify

[English Version README.md](./README.md)

> ⚠️ **警告**: 这还不是正式发布的版本，API 可能会发生变化。

**Nestify** 是类似 NestJS 的基于 Fastify 的依赖注入框架，使用现代 Stage 3 装饰器规范，而不是 NestJS 使用的旧版实验性装饰器。

## 安装

```bash
pnpm add nestify-js
```

> Note: 推荐将 tsconfig.json 里的 `strictPropertyInitialization` 设为 `false`，否则属性注入会有红色波浪线（属性未初始化）。

## 快速上手

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
  listen: true, // 使用 `PORT` / `HOST` 环境变量，默认 3000 / 0.0.0.0
});
```

## 路由

### HTTP 方法装饰器

`@Get`、`@Post`、`@Put`、`@Patch`、`@Delete` 用于在控制器方法上定义路由；其余方法用 `HttpMethod(method)`：

```typescript
import { Controller, Get, Post, HttpMethod } from 'nestify-js';

@Controller('/api') // 路由前缀，可选
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

### 路由选项

- `@ApiSchema({ summary, description, tags, ... })` — OpenAPI/Swagger 的 schema 信息。
- `@Opt(options)` — 额外的 Fastify 路由选项（例如 `{ bodyLimit: 1048576 }`）。

```typescript
@Controller('/files')
class FileController {
  @Post('/upload')
  @ApiSchema({ summary: '上传文件', tags: ['files'] })
  @Opt({ bodyLimit: 1048576 })
  uploadFile() {
    return { uploaded: true };
  }
}
```

## 依赖注入

```typescript
@Injectable() // 标记一个类可被注入
class UserService {}

@Module({
  imports: [DatabaseModule],     // 导入其他模块
  providers: [UserService],      // 本模块的服务
  controllers: [UserController], // 本模块的控制器
  exports: [UserService],        // 对导入方可见的 provider
})
class UserModule {}

@Injectable()
class UserController {
  @Inject(UserService)     // 按 class 注入
  userService: UserService;

  @Inject('DATABASE_URL')  // 也可以按 string/symbol token 注入
  databaseUrl: string;
}
```

模块可以互相导入并使用对方导出的 provider。同一模块内允许循环依赖；跨模块循环依赖需要在启动选项中设置 `allowCrossModuleCircularReference: true`。provider 是**每个 app 实例内**的单例 —— 见[多实例](#多实例)。

## 中间件

中间件有四种：**Guard（守卫）**、**Interceptor（拦截器）**、**Pipe（管道）**、**Filter（异常过滤器）**。自定义中间件类必须继承 `NestifyGuard` / `NestifyInterceptor` / `NestifyPipe` / `NestifyFilter`，并在某个模块的 `providers` 中注册（或通过 `useGlobalXXX`，见下文）。它们同时也是 `Injectable`，内部可以使用 `@Inject`。

单个请求的执行顺序：

```
Request → Guard → Interceptor(进入) → Pipe → Controller 方法 → Interceptor(离开) → Response
            └────────────────── 未捕获异常 → Filter ──────────────────┘
```

通过 `@UseGuards` / `@UseInterceptors` / `@UsePipes` / `@UseFilters` 应用在**控制器类**上（影响全部路由）或**方法**上（只影响该路由）。同类中间件按顺序执行：全局 → 控制器 → 方法。

所有中间件都通过 `ExecutionContext` 访问请求信息：

```typescript
const http = context.switchToHttp();
http.getRequest<FastifyRequest>(); // fastify request 对象
http.getReply<FastifyReply>();     // fastify reply 对象
context.getClass();                // 当前控制器类
context.getHandler();              // 当前处理方法
```

### Guard（守卫）

`canActivate` 返回 `false` 或抛出异常时，请求被中止：

```typescript
@Guard()
class AuthGuard extends NestifyGuard {
  @Inject(AuthService)
  authService: AuthService;

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    return request.headers.authorization === 'Bearer valid-token';
    // 也可以抛出 new UnauthorizedException() 返回特定错误
  }
}

@Module({ controllers: [AdminController], providers: [AuthGuard] }) // 必须注册
class AdminModule {}

@Controller('/admin')
@UseGuards(AuthGuard)               // 控制器级别
class AdminController {
  @Get('/dashboard')
  getDashboard() {
    return { data: 'sensitive' };
  }

  @Get('/stats')
  @UseGuards(AnotherGuard)          // 方法级别，排在控制器级别守卫之后
  getStats() {
    return { data: 'stats' };
  }
}
```

### Interceptor（拦截器）

拦截器接收 `(context, next)` 并且必须返回 `next`。通过链式的 `.map()` / `.catch()` 在响应阶段加工结果或处理错误：

```typescript
@Interceptor()
class LoggingInterceptor extends NestifyInterceptor {
  intercept(context: ExecutionContext, next: NestifyInterceptorNextHandler) {
    const start = Date.now();

    return next
      .map((result: any) => {
        // 离开阶段执行：方法 → 控制器 → 全局
        return { data: result, elapsed: Date.now() - start };
      })
      .catch((error: unknown) => {
        // 返回值即可恢复，重新抛出则继续传递失败
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

- 拦截器按注册顺序进入（全局 → 控制器 → 方法）；`.map()` 回调按相反顺序执行。
- 每个 `.map()` 接收当前结果，返回值传给下一个外层拦截器，最终作为响应。

### Pipe（管道）

管道负责校验和转换输入数据；每个管道的返回值会成为下一个管道的 `input`。校验基于 Fastify 的 `validatorCompiler`。

```typescript
@Pipe()
class TrimPipe extends NestifyPipe {
  async transform(context: ExecutionContext, input: any[], schema?: PipeFullSchema) {
    return input.map((v) => (typeof v === 'string' ? v.trim() : v));
  }
}

@Controller('/users')
@UsePipes(TrimPipe) // 不带 schema 也可以（只做转换）
class UserController {
  @Post('/')
  @UsePipes({ pipe: TrimPipe, schema: { body: { type: 'object', required: ['name'] } } })
  createUser() {
    // ...
  }
}
```

**内置管道**从 `request` 对象中提取数据并传给处理方法。它们已被自动注册，直接使用装饰器即可：

```typescript
@Controller('/users')
class UserController {
  @Post('/')
  @Body({ type: 'object', required: ['name', 'email'] }) // schema 同时用于 swagger
  createUser(body: any) {
    return { user: body };        // 处理方法收到 request.body
  }

  @Get('/')
  @Query({ type: 'object' })
  getUsers(query: any) {
    return { query };             // 处理方法收到 request.query
  }

  @Get('/:id')
  @Params({ type: 'object', required: ['id'] })
  getUser(params: any) {
    return { id: params.id };     // 处理方法收到 request.params
  }

  @Get('/ip')
  getIp(ip: string) {
    return { ip };                // @Ip：处理方法收到 request.ip
  }

  @Post('/raw')
  handleRaw(raw: any) {
    return { received: true };    // @Raw：处理方法收到 request.raw
  }
}
```

> **注意**：`@Body` / `@Query` / `@Params` / `@Ip` / `@Raw` 会忽略前一个管道的返回值，强制从 `request` 对象取值。如果需要链式管道，请把它们放在最后，或者在自定义管道里自己处理数据。

### Filter（异常过滤器）

过滤器处理路由抛出的异常。在装饰器中指定要捕获的异常类（省略则捕获全部）：

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

### 全局中间件

通过启动选项全局应用中间件 —— 列出的类会被自动实例化并全局生效，无需在 `providers` 中注册：

```typescript
await nestify(AppModule, {
  useGlobalGuards: [AuthGuard],
  useGlobalInterceptors: [LoggingInterceptor],
  useGlobalPipes: [ValidationPipe],
  useGlobalFilters: [HttpExceptionFilter],
});
```

也可以把 `APP_GUARD` / `APP_INTERCEPTOR` / `APP_PIPE` / `APP_FILTER` 作为 provider 注册；每个 token 在同一个 app 内只能注册一次：

```typescript
@Module({
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
class AppModule {}
```

### 内置 JWT 守卫

框架自带 `JwtGuard`（已自动注册，无需加入 providers）。它会校验 `Authorization: Bearer <token>` 中的 token，并把解码后的 payload 挂到请求上：

```typescript
import { JwtGuard, JwtService, jwt } from 'nestify-js';

// `jwt` 是默认的 JwtService 实例；也可以传入自己的：JwtGuard(myJwt)
@Controller('protected')
@UseGuards(JwtGuard())
class ProtectedController {
  @Get('profile')
  async getProfile(request: any) {
    return request;
  }
}
```

## 定时任务（Cron）

在 `@Injectable` provider 的方法上用 `@Cron(expression, uid?)` 装饰。任务在启动时绑定，并在所有模块注册完成后**自动开始**：

```typescript
import { Cron, CronExpressions } from 'nestify-js';

@Injectable()
class ScheduledTasks {
  @Cron(CronExpressions.EVERY_30_SECONDS)
  tick() {
    // ...
  }

  @Cron('0 0 * * *', 'daily-report') // uid 可选，start/stop 时需要
  dailyReport() {
    // ...
  }
}

@Module({ providers: [ScheduledTasks] })
class AppModule {}
```

任务抛出的错误（或 rejected 的 promise）会通过 app 的 logger 记录，调度继续进行。超过 Node `setTimeout` 上限（约 24.8 天）的长间隔会被自动处理，`app.close()` 时所有任务会被清理。

通过 app 实例控制任务：

```typescript
app.getCronJobStates();    // [{ uid, expression, nextTime, running }]
app.stopCronJob('daily-report');
app.startCronJob('daily-report');
app.launchCronJobs();      // 启动所有未运行的任务；幂等
```

## 多实例

每次调用 `nestify()` / `apply()` 都会创建一个完全隔离的应用：拥有独立的 injector、provider 单例、全局中间件集合和定时任务。因此同一个模块树可以同时挂载到多个 app 上，例如用于测试或多租户场景：

```typescript
const [first, second] = await Promise.all([
  nestify(AppModule),
  nestify(AppModule),
]);

// 每个 app 有独立的 injector、collection 和 provider 单例
first.injector !== second.injector;
first.injector.get(UserService) !== second.injector.get(UserService);

await first.inject({ method: 'GET', url: '/api/users' }); // 由 `first` 自己的实例处理
await first.close();
await second.close();
```

## 自定义装饰器与元数据

`createDecorator(key)` 创建一个 Stage 3 的类/方法装饰器，用于存储自定义元数据：

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

    const currentRole = 'admin'; // 从认证后的请求或某个 service 中读取
    return !roles?.length || roles.includes(currentRole);
  }
}
```

可用的工具函数：

- `createDecorator<T>(key)` — 创建可用于类和方法的装饰器。
- `getClassMetadata<T>(controller, key)` / `getMethodMetadata<T>(controller, methodName, key)` — 读取元数据。
- `setClassMetadata(context, key, value)` / `setMethodMetadata(context, key, value)` — 在自定义 Stage 3 装饰器实现中写入元数据。
- `SymbolMetadata` — 底层的 Stage 3 metadata symbol，供高级用法使用；一般优先用上面的工具函数。

## 应用启动

### `nestify(rootModule, options?)`（推荐）

一次调用完成：创建 fastify 实例、注册 fastify 插件、应用所有模块，并（可选）开始监听。返回底层的 fastify 实例。

```typescript
const app = await nestify(AppModule, {
  logger: { level: 'info' },

  // 在模块应用之前注册的 fastify 插件
  plugins: [
    [multipart, { limits: { fileSize: 10 * 1024 * 1024 } }],
    [staticFiles, { root: './public', prefix: '/' }],
  ],

  listen: true, // 或 listen: { port: 8080, host: 'localhost' }
});
```

| 选项                                | 类型                                        | 说明                                                                                    |
| ----------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `logger`                            | `FastifyServerOptions['logger']`            | `fastify.logger` 的快捷方式                                                              |
| `fastify`                           | `FastifyServerOptions`                      | 传给 fastify 工厂的选项（`fastify(options)`）                                            |
| `ignoreTrailingSlash`               | `boolean`                                   | 将 `/path/` 和 `/path` 视为同一路由。`@default true`                                     |
| `plugins`                           | `readonly [plugin, options?][]`             | 在模块应用之前注册的 fastify 插件                                                        |
| `listen`                            | `boolean \| Partial<FastifyListenOptions>`  | 所有模块注册完成后开始监听；`true` 时使用 `PORT` / `HOST` 环境变量（默认 3000 / 0.0.0.0） |
| `allowCrossModuleCircularReference` | `boolean`                                   | 必须设为 `true` 才允许**跨模块**循环依赖（同模块内的始终允许）。`@default false`         |
| `registerGlobalMiddlewares`         | `ProviderOptions[]`                         | 只实例化注册、不全局生效的中间件（内置管道和 `JwtGuard` 会自动前置）                     |
| `useGlobalGuards`                   | `ProviderOptions[]`                         | 全局生效，按数组顺序：全局 → 控制器 → 方法                                               |
| `useGlobalInterceptors`             | `ProviderOptions[]`                         | 全局生效，按数组顺序：全局 → 控制器 → 方法 → 控制器 → 全局                               |
| `useGlobalPipes`                    | `ProviderOptions[]`                         | 全局生效，按数组顺序：全局 → 控制器 → 方法                                               |
| `useGlobalFilters`                  | `ProviderOptions[]`                         | 全局生效，作为最底层的过滤器                                                             |

### `apply(app, options)`

如果需要对 fastify 实例做更多控制（自定义插件、钩子、装饰器等），可以自己创建实例，然后使用更底层的 `apply()`：

```typescript
import fastify from 'fastify';
import { apply, type NestifyInstance } from 'nestify-js';

// `apply()` 要求传入 `NestifyInstance`，因为注册模块时会在实例上安装 cron 方法
const app = fastify({ logger: true }) as NestifyInstance;

await apply(app, { rootModule: AppModule });

app.getCronJobStates(); // apply() 之后可用；定时任务已开始
await app.listen({ port: 3000 });
```

## 特性

- ✅ 现代 Stage 3 装饰器
- ✅ 依赖注入，支持循环依赖
- ✅ HTTP 方法装饰器（GET、POST、PUT、PATCH、DELETE 等）
- ✅ 路由参数、查询、请求体校验
- ✅ Guard、Interceptor、Pipe、Filter
- ✅ 通过启动选项或 `APP_*` token 注册全局中间件
- ✅ 模块系统（imports/exports）
- ✅ 内置定时任务调度，支持运行时控制
- ✅ 完全隔离的多 app 实例
- ✅ OpenAPI/Swagger schema 支持、内置 HTTP 异常
- ✅ 内置文件上传（`@fastify/multipart`）与 JWT 认证

## License

MIT
