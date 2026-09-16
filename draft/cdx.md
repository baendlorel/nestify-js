# Codex 审查笔记

审查日期：2026-09-16

范围：当前 `dev` 分支，重点关注近期 Cron/NestifyInstance 相关改动、应用隔离、公开 API、测试、类型检查以及打包产物。

## P0 —— 阻塞类型安全发布

### 1. `FastifyInstance` 与 `NestifyInstance` 用在了错误的生命周期边界上

相关文件：

- `packages/core/src/types/instance.ts`
- `packages/core/src/register/index.ts:33`
- `packages/core/src/register/module.ts:132-148`
- `packages/core/src/register/lazy-injector.ts:133`

`NestifyInstance` 要求 Cron 方法已经存在，但 `apply()` 接受的 `NestifyInstance` 上这些方法尚未安装。同时，`ModuleRegister` 保存的是普通的 `FastifyInstance`，却把它传给 `injector.apply()`，而后者当前要求 `NestifyInstance`。

当前编译错误：

```text
packages/core/src/register/module.ts(148,20): error TS2345:
FastifyInstance is not assignable to NestifyInstance;
launchCronJobs/startCronJob/stopCronJob/getCronJobStates are missing.
```

这与文档中的公开 API 也相冲突：

```ts
const app = fastify();
await apply(app, { rootModule: AppModule });
```

建议方向：

- 接收未初始化 app 的函数（`apply`、模块注册、懒注入、Cron 绑定）应当接受 `FastifyInstance`。
- Cron 的初始化点可以在内部做类型转换／增强。
- 如果调用方需要这些新方法，优先让 `apply()` 返回增强后的实例：

```ts
async function apply(app: FastifyInstance, options: ...): Promise<NestifyInstance>
```

当前的 Cron 测试使用 `as any`/`as unknown as NestifyInstance`，这是在掩盖该契约问题，而不是在测试它。

==回答：不，应该全面使用NestifyInstance.

### 2. check 命令报告了错误，却以成功状态退出

`scripts/check.ts:8-15` 捕获了每一个失败的 `tsc` 进程，却从未设置失败退出码，也没有重新抛出。结果就是 `pnpm run check` 在打印大量 TypeScript 错误的同时返回了退出码 0。

这会让 CI 或发布脚本把一个已经损坏的工作区当作有效的。应当累积失败，并在所有包检查完毕后抛出异常／设置 `process.exitCode = 1`。

==回答：没关系，先这样用。

### 3. 发布出去的声明文件路径并不存在

当前构建产出：

```text
dist/index.d.mts
dist/index.d.cts
```

但 Core、Shared 和 Nestify 的包清单都指向：

```json
"types": "./dist/index.d.ts"
```

`dist/index.d.ts` 在这些包里都不存在。因此 TypeScript 使用方可能无法解析声明。

Core 还发布了一个 `./test` 导出，其声明文件与运行时文件全部缺失：

```text
dist/test.d.ts
dist/test.mjs
dist/test.cjs
```

要么配置构建产出清单中写的路径，要么把 `types`／条件导出改成实际生成的文件。除非 `./test` 被作为真正的入口来构建，否则应当删除它。

==回答：帮我修改

## P1 —— 运行时隔离与正确性

### 4. 注入器与全局注册状态依然是进程级全局的

`packages/core/src/register/index.ts:9-13` 只清理了期望缓存：

```ts
clearExpectCache();
// lazyInjector.clear();
// collection.clear();
```

注入器把 `instanceMap` 和 `injectList` 放在模块作用域，而 `collection` 也把全局 modules/providers/middleware 数组放在模块作用域。因此，在同一进程内创建第二个 Nestify 应用可能会：

- 复用第一个应用的 provider 实例；
- 保留第一个应用的 `APP_LOGGER`，而不是注册第二个应用的 logger；
- 在应用之间泄漏全局模块与中间件配置；
- 在关闭之后仍然持有应用对象。

Cron 作业现在已按应用隔离，但持有 Cron 实例的 provider 容器并没有。如果支持多应用实例，注入器／collection 状态同样需要按应用作用域隔离。如果只支持单个应用，就应当显式拒绝第二次初始化，并把这一限制写入文档。

==回答：先不改

### 5. Cron 作业可能被重复绑定

`lazy-injector.ts` 遍历 `instanceMap.values()`。一个 `useExisting` provider 可以把同一个对象挂在多个 token 下，导致 `bindCronJob()` 对同一个实例绑定多次。

`bindCronJob()` 本身也不做去重，重复调用同样会被接受。重复的作业随后各自独立运行，而重复的 UID 会让 `startCronJob`/`stopCronJob` 只作用于第一个匹配项。

建议的检查：

- 绑定前先对实例去重，或改为记录 `(instance, method)` 对；
- 在单个应用内拒绝重复的非 undefined UID。

==回答：改为根据函数集合去重。可以每增加一个JobData，都将fn加入一个临时set，看看这个函数有没有加过，没有的话就绑定 Cron 作业，否则跳过。

### 6. Cron 生命周期的测试覆盖过窄

新测试只验证了「在首次调用之前 close 会取消定时器」。缺失的用例包括：

- 两个 Cron provider 都被注册；
- 第一个 Cron provider 之前存在非 Cron provider；
- `launchCronJobs()` 具备幂等性；
- 同步抛错与异步 rejection 会被记录日志并重新调度；
- 在作业 Promise 运行期间 stop 能阻止 `.finally(fn)` 重新调度；
- 对单个 UID 先停止再重启；
- 两个 Nestify 应用保持隔离；
- 重复绑定／重复 UID 的行为；
- 长延时分片滚动时会更新可取消的定时器。

这些用例应当使用 fake timers，以保证行为可确定性地复现。
==回答：帮我改

### 7. Cron 实现的小幅清理

在 `packages/core/src/schedule/cron.ts` 中：

- `delay === MAX_DELAY` 会走长延时分支并额外创建一个零延时定时器；应改为 `delay <= MAX_DELAY`。
- `longTimeout()` 被导出了，但它只是一个使用私有 `JobData` 的内部实现；除非有意公开，否则应移除 `export`。
- `getOrInsertWeak()` 只被调用一次，却为这么一个平凡操作引入了共享抽象。除非该辅助函数会有多个真实调用方，否则就地内联 `WeakMap.get/set`。
- 如果 `app.log.error()` 抛错，`.finally(fn)` 返回的 Promise 可能变成未处理的 rejection。在 Fastify 的 logger 下风险很低，但在错误链契约中应当纳入考虑。
  
==回答：先不改

## P1 —— 公开 API 与文档

### 8. 文档中写的顶层 `logger` 选项仍不受支持

README、JSDoc 以及 `example/backend/app.ts` 中用的是：

```ts
nestify(AppModule, { logger: true });
```

但 `NestifyBootOptions` 没有 `logger` 属性，`nestify()` 也只把 `opts.fastify` 转发给 Fastify 工厂。这个顶层选项无法通过类型检查；若通过 `any` 强行传入，运行时也会被忽略。

当前可用的写法：

```ts
nestify(AppModule, {
  fastify: { logger: true },
});
```

要么把这个快捷写法补回来，要么更新所有文档／示例。

==回答：只要这里的logger和fastify的logger效果一样就好

### 9. `ignoreTrailingSlash` 的优先级与其文档相矛盾

注释里说 Fastify 的选项可以覆盖 Nestify 的默认值，但实现是先展开 `routerOptions`，随后总是写入顶层的 `ignoreTrailingSlash`（默认 `true`）：

```ts
routerOptions: {
  ...routerOptions,
  ignoreTrailingSlash,
}
```

因此 `fastify.routerOptions.ignoreTrailingSlash` 无法覆盖默认值。要么把优先级反过来，要么更新文档，要求使用 Nestify 层级的选项。

==回答：我需要让nestify的ignoreTrailingSlash优先级高于fastify的routerOptions的
### 10. 示例应用无法通过类型检查

`example/pnpm run check` 目前会失败，因为它引用了已被删除或迁移的 API，包括：

- `setupBasicPipes`；
- 顶层 `logger`；
- 旧的中间件实现类型（`NestifyFilter`、`NestifyGuard`、`NestifyInterceptor`、`NestifyPipe`）。

示例应当在发布前更新，因为它现在展示的是用户根本无法编译的 API。
==回答：先不改

--- 先看到这里
## P1 —— 测试与 lint 基础设施

### 11. 全量测试套件无法从仓库根目录运行

`pnpm exec vitest run` 目前报告 8 个文件通过、7 个测试套件失败。

观察到两个相互独立的原因：

1. 根目录的测试导入了 `fastify`，但在 pnpm 的严格依赖布局下，根包并没有声明／安装它。
2. 测试校验失败路径的用例调用了源码级的 `_throw` 宏，但 Vitest 的转换不会替换 `_throw`；它们会以 `ReferenceError: _throw is not defined` 失败。

要么在依赖完整的各包上下文中运行测试，要么让根目录的测试环境与构建转换保持一致。

### 12. lint 命令无法解析其配置

`pnpm run lint` 在真正开始 lint 之前就失败了：

```text
Unsupported named config "oxlint-plugin-typescript/recommended" in extends.
```

`.oxlintrc.json` 把 Oxlint 不支持的 ESLint 风格共享配置名和 Oxlint 配置混在了一起。应当把配置改为 Oxlint 支持的插件／规则。

### 13. 类型检查失败时构建仍然成功

`pnpm run build` 成功完成，而 `pnpm --filter @nestify-js/core check` 却失败了。发布流程因此可能产出带有已知 TypeScript 契约错误的包。

发布／release 流程应当在构建或发布之前运行一次不会吞掉错误的类型检查。

## P2 —— 发布一致性

### 14. 各包版本不一致

当前版本：

```text
@nestify-js/core   0.6.0
@nestify-js/shared 0.5.4
nestify-js         0.5.4
root package       0.2.0
```

另外，`syncRootVersion()` 查找的是 `@nestify/core`，而实际的包名是 `@nestify-js/core`，所以根版本同步永远找不到 Core。

先决定这些包是否独立版本化。如果这是一次协同的 0.6.0 发布，就同步版本号并修正包名比较逻辑。

### 15. 条件导出顺序会产生警告

包清单把 `default` 放在 `require` 之前。工具链会警告 `require` 不可达，因为 `default` 会先匹配。两者目前都指向同一个 CJS 文件，所以运行时影响有限，但清单中应当把更具体的条件放在 `default` 之前。

## 已执行的验证

```text
Core 单元测试:      6 个文件通过，32 个用例通过
全量 Vitest 运行:   8 个文件通过，7 个测试套件失败
Core 类型检查:      失败（NestifyInstance/FastifyInstance 不匹配）
工作区检查:         打印了错误，却以成功状态退出
构建:               存在类型错误仍然成功
示例类型检查:       失败
Lint:               配置解析失败
Cron onClose 测试:  通过
```
