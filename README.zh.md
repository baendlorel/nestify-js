# Nestify

[English Version README.md](./README.md)

> ⚠️ **警告**: 这还不是正式发布的版本，API 可能会发生变化。

**Nestify** 是类似 NestJS 的基于 Fastify 的依赖注入框架，使用现代 Stage 3 装饰器而不是 NestJS 使用的旧版装饰器。

这个项目的创建是因为 NestJS 使用的是旧版装饰器语法，但我们希望能够利用新的 Stage 3 装饰器规范来获得更好的类型安全性和现代 JavaScript 特性。

## 安装

```bash
pnpm add nestify-js
```

## API 文档

装饰器使用起来的感觉大部分和NestJS一样，但也略有区别。

> Note: 推荐将tsconfig.json里的`strictPropertyInitialization`设为`false`，否则依赖注入的属性会有红色波浪线，因其没有初始化

### HTTP 方法装饰器

这些装饰器用于在控制器方法上定义 HTTP 路由：

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
    return { message: '用户已创建' };
  }

  @Put('/users/:id')
  updateUser() {
    return { message: '用户已更新' };
  }

  @Patch('/users/:id')
  patchUser() {
    return { message: '用户已修改' };
  }

  @Delete('/users/:id')
  deleteUser() {
    return { message: '用户已删除' };
  }

  @(HttpMethod('OPTIONS')('/users'))
  optionsUsers() {
    return { methods: ['GET', 'POST'] };
  }
}
```

### 路由配置

#### `@Controller(prefix?: string)`

将类标记为控制器并可选地设置路由前缀：

```typescript
@Controller('/api/v1')
class ApiController {
  @Get('/health')
  health() {
    return { status: 'ok' };
  }
}
// 这会创建路由：GET /api/v1/health
```

#### `@ApiSchema(schema)`

为路由设置 OpenAPI/Swagger 模式信息：

```typescript
@Controller('/users')
class UserController {
  @Get('/:id')
  @ApiSchema({
    summary: '根据ID获取用户',
    description: '通过唯一标识符检索用户',
    tags: ['users'],
  })
  getUser() {
    return { user: {} };
  }
}
```

#### `@Opt(options)`

设置额外的 Fastify 路由选项：

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

### 依赖注入

#### `@Injectable()`

将类标记为可以被注入的服务：

```typescript
@Injectable()
class UserService {
  getUsers() {
    return [{ id: 1, name: 'John' }];
  }
}
```

#### `@Inject(token)`

将依赖项注入到类属性中：

```typescript
@Injectable()
class UserController {
  @Inject(UserService)
  userService: UserService;

  @Inject('DATABASE_URL')
  databaseUrl: string;

  getUsers() {
    return this.userService.getUsers();
  }
}
```

#### `@Module(options)`

定义具有提供者、控制器、导入和导出的模块：

```typescript
@Module({
  imports: [DatabaseModule],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
class UserModule {}
```

### 自定义装饰器与元数据

`createDecorator(key)` 可以创建一个用于类或方法的 Stage 3 装饰器并保存自定义元数据。元数据 getter 现在直接接收控制器类，不再接收 `ExecutionContext`：

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

    const currentRole = 'admin'; // 实际项目中应从已认证的请求或服务中读取
    return !roles?.length || roles.includes(currentRole);
  }
}
```

可用的辅助函数包括：

- `createDecorator<T>(key)`：创建可用于类和方法的装饰器。
- `getClassMetadata<T>(controller, key)`：读取类元数据。
- `getMethodMetadata<T>(controller, methodName, key)`：读取方法元数据。
- `setClassMetadata(context, key, value)` / `setMethodMetadata(context, key, value)`：在自行编写的 Stage 3 装饰器中写入元数据。
- `SymbolMetadata`：提供底层 Stage 3 元数据 Symbol，仅建议高级场景使用；一般优先使用上述辅助函数。

### 中间件系统

中间件共四种：**守卫（Guard）**、**拦截器（Interceptor）**、**管道（Pipe）**、**过滤器（Filter）**。

单个请求的执行顺序：

```
请求 → 守卫 → 拦截器(进入) → 管道 → 控制器方法 → 拦截器(离开) → 响应
          └────────────────── 未处理异常 → 过滤器 ──────────────────┘
```

#### 注册规则（重要）

- **内置中间件自动注册**：框架内置的管道（`PipeBody` / `PipeQuery` / `PipeParams` / `PipeIp` / `PipeRaw` / `PipeFile`）和 `JwtGuard` 会在 `apply()` 时自动创建实例，开箱即用，无需任何配置。
- **自定义中间件必须注册**：被 `@Guard()` / `@Interceptor()` / `@Pipe()` / `@Filter()` 标记的类和 NestJS 一样，必须出现在某个模块的 `providers` 中，否则路由注册时会报 `Cannot find class for token` 错误。
- **使用位置**：`@UseGuards` / `@UseInterceptors` / `@UsePipes` / `@UseFilters` 既可以标在**控制器类**上（对该控制器所有路由生效），也可以标在**方法**上（只对该路由生效）。同类中间件按 全局 → 控制器 → 方法 的顺序依次执行。
- 自定义中间件类必须**继承** `NestifyGuard`、`NestifyInterceptor`、`NestifyPipe` 或 `NestifyFilter`，装饰器会在运行时校验基类。中间件类本身也是 `Injectable`，支持 `@Inject` 属性注入。

#### 守卫 (Guards)

守卫控制对路由的访问。`canActivate` 返回 `false` 或抛出异常都会中断请求：

```typescript
@Guard()
class AuthGuard extends NestifyGuard {
  // 支持依赖注入
  @Inject(AuthService)
  authService: AuthService;

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    return request.headers.authorization === 'Bearer valid-token';
    // 也可以直接 throw new UnauthorizedException() 给出具体错误
  }
}

// 注册进 providers 后才能使用
@Module({ controllers: [AdminController], providers: [AuthGuard] })
class AdminModule {}

@Controller('/admin')
@UseGuards(AuthGuard) // 控制器级：所有路由生效
class AdminController {
  @Get('/dashboard')
  getDashboard() {
    return { data: '敏感数据' };
  }

  @Get('/stats')
  @UseGuards(AnotherGuard) // 方法级：只对此路由生效（追加在控制器级之后）
  getStats() {
    return { data: '统计数据' };
  }
}
```

全局守卫使用 `APP_GUARD` 作为 token 注册，对所有路由生效（每种全局中间件只能注册一个）：

```typescript
@Module({
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
class AppModule {}
```

#### 拦截器 (Interceptors)

拦截器会在管道和控制器方法执行前接收 `(context, next)`。`intercept()` 必须返回传入的 `next`，并通过类似 Promise 的 `.then()` 和 `.catch()` 注册反向阶段的处理逻辑：

```typescript
@Interceptor()
class LoggingInterceptor extends NestifyInterceptor {
  intercept(context: ExecutionContext, next: InterceptorNextHandler) {
    const start = Date.now();
    console.log('请求开始');

    return next
      .then((result: any) => {
        console.log(`请求完成，耗时 ${Date.now() - start}ms`);
        return {
          data: result,
          elapsed: Date.now() - start,
        }; // 该值会继续传给外层拦截器，最终作为响应值
      })
      .catch((error: unknown) => {
        console.error('响应转换失败', error);
        throw error;
      });
  }
}

@Controller('/api')
@UseInterceptors(LoggingInterceptor)
class ApiController {
  @Get('/data')
  getData() {
    return { value: '示例数据' };
  }
}
```

拦截器的重要执行规则：

- 进入阶段按注册顺序执行：全局 → 控制器 → 方法。
- `next.then(...)` 按相反顺序执行：方法 → 控制器 → 全局。
- 每个 `.then()` 接收当前结果，其返回值会传给下一个外层拦截器。
- 如果某个拦截器的 `.then()` 抛出异常或返回 rejected Promise，会进入它对应的 `.catch()`；`.catch()` 可以返回值恢复流程，也可以继续抛出异常。
- `intercept()` 必须返回传入的 `next`；旧版直接返回函数的写法已不再支持。

全局拦截器使用 `{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }`。

#### 管道 (Pipes)

管道负责验证和转换输入数据，前一个管道的返回值会作为下一个管道的 `input`。

**自定义管道**通过 `@UsePipes` 使用，可附带验证 schema（校验基于 fastify 的 `validatorCompiler`）：

```typescript
@Pipe()
class TrimPipe extends NestifyPipe {
  async transform(context: ExecutionContext, input: any[], schema?: PipeFullSchema) {
    // input 是上一步的数据；返回值传给下一个管道或控制器方法
    return input.map((v) => (typeof v === 'string' ? v.trim() : v));
  }
}

@Controller('/users')
@UsePipes(TrimPipe) // 也可以不传 schema，只做转换
class UserController {
  @Post('/')
  @UsePipes({
    pipe: TrimPipe,
    schema: { body: { type: 'object', required: ['name'] } }, // PipeOptions：pipe + schema
  })
  createUser() {
    // ...
  }
}
```

**内置管道**（自动注册，直接使用）会从 `request` 对象提取数据并作为控制器方法的参数：

```typescript
@Controller('/users')
class UserController {
  // @Body(schema?, ok?, other?)
  // - schema: 校验 request.body 的 JSON Schema
  // - ok: 生成 response.200 的 schema（供 swagger 使用）
  // - other: 其余 fastify route schema（如 headers、response 等）
  @Post('/')
  @Body({ type: 'object', required: ['name', 'email'] })
  createUser(body: any) {
    return { user: body }; // handler 收到 request.body
  }

  @Get('/')
  @Query({ type: 'object' })
  getUsers(query: any) {
    return { query }; // handler 收到 request.query
  }

  @Get('/:id')
  @Params({ type: 'object', required: ['id'] })
  getUser(params: any) {
    return { id: params.id }; // handler 收到 request.params
  }

  @Get('/ip')
  getUserIP(ip: string) {
    return { ip }; // handler 收到 request.ip
  }

  @Post('/raw')
  handleRaw(raw: any) {
    // @Raw(): handler 收到 request.raw（原始 Node 请求）
    return { received: true };
  }
}
```

> **注意**：`@Body` / `@Query` / `@Params` / `@Ip` / `@Raw` 会忽略之前管道的返回值，强制从 `request` 对象提取数据。多个管道串行使用时请把它们放在最后，或在自定义管道中自行处理。

全局管道使用 `{ provide: APP_PIPE, useClass: MyPipe }`（也可以是 `{ provide: APP_PIPE, useValue: { pipe: MyPipe, schema: {...} } }`）。

#### 过滤器 (Filters)

过滤器处理路由抛出的异常。构造时可指定捕获的异常类型（不传则捕获所有）：

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
    throw new HttpException('出错了', 400);
  }
}
```

全局过滤器使用 `{ provide: APP_FILTER, useClass: HttpExceptionFilter }`。

#### 内置 JWT 守卫

框架内置 `JwtGuard`（自动注册，无需放进 providers），从 `Authorization: Bearer <token>` 提取并校验 token，校验通过后将解码的 payload 挂到 `request` 上：

```typescript
import { JwtGuard, JwtService, jwt } from 'nestify-js';

// jwt 是默认的 JwtService 实例；也可以 new JwtService(...) 后传入 JwtGuard(myJwt)
@Controller('protected')
@UseGuards(JwtGuard())
class ProtectedController {
  @Get('profile')
  async getProfile(request: any) {
    // 方法第一个参数是管道结果；也可以在守卫/拦截器中
    // 通过 context.switchToHttp().getRequest() 读取
    return request;
  }
}
```

#### ExecutionContext

所有中间件都通过 `context: ExecutionContext` 访问请求信息：

```typescript
const http = context.switchToHttp();
const request = http.getRequest<FastifyRequest>(); // fastify 请求对象
const reply = http.getReply<FastifyReply>(); // fastify 响应对象

context.getClass(); // 当前控制器类
context.getHandler(); // 当前处理方法
```


### 应用启动

#### `nestify(rootModule, options?)`（推荐）

一行代码完成：创建 fastify 实例、注册 fastify 插件、应用所有模块，并（可选地）开始监听端口。返回底层的 fastify 实例。

```typescript
import { nestify } from 'nestify-js';

const app = await nestify(AppModule, {
  // `fastify.logger` 的快捷方式
  logger: { level: 'info' },

  // 在模块应用之前注册的 fastify 插件
  // - 元组形式：`[plugin]` 或 `[plugin, options]`
  plugins: [
    [multipart, { limits: { fileSize: 10 * 1024 * 1024 } }],
    [staticFiles, { root: './public', prefix: '/' }],
  ],

  // 注册自动创建实例的 setup 回调（可选）
  // - 内置管道和 JwtGuard 已自动注册，通常无需配置

  // 所有模块注册完成后开始监听
  // - `true` 时读取 `PORT` / `HOST` 环境变量（默认 3000 / 0.0.0.0）
  listen: true,
  // 也可以覆盖：listen: { port: 8080, host: 'localhost' }
});
```

可用选项：

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `logger` | `FastifyServerOptions['logger']` | `fastify.logger` 的快捷方式 |
| `fastify` | `FastifyServerOptions` | 传给 fastify 工厂函数的选项（`fastify(options)`） |
| `plugins` | `readonly [plugin, options?][]` | 在模块应用之前注册的 fastify 插件（callback 风格和 async 风格都可以） |
| `setup` | `(register: (cls: Constructor) => void) => void` | 注册自动创建实例的 setup 回调（可选；内置管道/JwtGuard 已自动注册，一般无需使用） |
| `listen` | `boolean \| Partial<FastifyListenOptions>` | 所有模块注册完成后开始监听 |
| `allowCrossModuleCircularReference` | `boolean` | 允许**跨模块**循环依赖时必须设为 `true`（同模块内的循环依赖默认允许）。默认 `false` |

#### `apply(app, options)`

如果需要对 fastify 实例做更多控制（自定义插件、钩子、装饰器……），可以自己创建实例，改用更底层的 `apply()`：

```typescript
import fastify from 'fastify';
import { apply } from 'nestify-js';

const app = fastify({ logger: true });

await apply(app, { rootModule: AppModule });
await app.listen({ port: 3000 });
```

## 完整使用示例

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

// 服务
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

// 守卫
@Guard()
class AuthGuard extends NestifyGuard {
  canActivate(context) {
    // 简单的认证检查
    const request = context.switchToHttp().getRequest();
    return request.headers.authorization === 'Bearer valid-token';
  }
}

// 控制器
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

// 模块
@Module({
  providers: [UserService, AuthGuard],
  controllers: [UserController],
})
class AppModule {}

// 启动应用
await nestify(AppModule, {
  logger: true,
  listen: true, // 读取 `PORT` / `HOST` 环境变量，默认 3000 / 0.0.0.0
});
console.log('服务器运行在 http://localhost:3000');
```

## 特性

- ✅ 现代 Stage 3 装饰器
- ✅ 支持循环依赖的依赖注入
- ✅ HTTP 方法装饰器 (GET, POST, PUT, PATCH, DELETE)
- ✅ 路由参数、查询和主体验证
- ✅ 用于身份验证/授权的守卫
- ✅ 用于请求/响应转换的拦截器
- ✅ 用于数据转换和验证的管道
- ✅ 异常过滤器
- ✅ 具有导入/导出的模块系统
- ✅ OpenAPI/Swagger 模式支持
- ✅ 内置 HTTP 异常
- ✅ 中间件执行上下文

## 许可证

MIT
