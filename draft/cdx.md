# Codex 审查笔记

审查日期：2026-09-16

范围：`dev` 分支（截至 be5c643）。**已修复的项已删除**，只保留未处理事项；编号沿用原编号，便于对照。

## P1 —— 运行时与流程

### 2. check 命令报告错误，却以成功状态退出

`scripts/check.ts:8-15` 捕获每一个失败的 `tsc` 进程后什么都不做，既不设失败退出码也不重新抛出。`pnpm run check` 会在打印一堆 TypeScript 错误的同时返回 0，CI 或发布脚本会把损坏的工作区当成有效。

应在所有包检查完毕后累积失败并设置 `process.exitCode = 1`。

> 批注：先这样用。

### 4. 注入器与全局注册状态仍是进程级全局

`packages/core/src/register/index.ts:9-13` 只清理期望缓存：

```ts
clearExpectCache();
// lazyInjector.clear();
// collection.clear();
```

`lazyInjector` 的 `instanceMap`/`injectList` 与 `collection` 的 modules/providers/middleware 数组都在模块作用域。同进程内创建第二个应用会复用第一个应用的 provider 实例、保留旧的 `APP_LOGGER`、在应用之间泄漏全局模块与中间件配置，并在 close 后继续持有应用对象。

Cron 作业本身已按应用隔离（`WeakMap`），但承载 Cron 实例的 provider 容器没有。要么把注入器/collection 也做成应用作用域，要么显式拒绝第二次初始化并把限制写入文档。

> 批注：先不改。

### 7. Cron 实现的小幅清理

`packages/core/src/schedule/cron.ts`：

- 第 49 行 `delay < MAX_DELAY`：`delay === MAX_DELAY` 时会走长延时分支并额外创建一个零延时定时器，应为 `delay <= MAX_DELAY`。
- `longTimeout()` 使用私有 `JobData`，不需要 `export`。
- `getOrInsertWeak()` 仅在第 144 行被调用一次，为一个平凡操作引入了共享抽象；没有第二个真实调用方时应就地内联。
- 若 `app.log.error()` 抛错，`.finally(fn)` 返回的 Promise 可能变成未处理的 rejection。

> 批注：先不改。

### 10. 示例应用无法通过类型检查

`example/pnpm run check` 目前 8 个错误，全部引用了已删除或迁移的 API：

- `setupBasicPipes`（`backend/app.ts:5`）以及同处的 `setup` 选项；
- 旧的中间件类型 `NestifyFilter` / `NestifyGuard` / `NestifyInterceptor` / `NestifyPipe`。

（顶层 `logger` 相关的报错已随 P0 修复消失。）

> 批注：先不改。

### 11. 全量测试套件无法从仓库根目录运行

`pnpm exec vitest run`：8 个文件通过、7 个套件失败，46 个用例通过。两个独立原因：

1. `tests/` 下 5 个文件（apply / auth / custom-decorator / main / multipart）导入 `fastify`，但根包没有声明该依赖，pnpm 严格布局下解析不到。
2. `packages/nestify/tests/` 的 auto-middleware 与 global-options 在模块顶层调用 `expect()`，源码中的 `_throw` 宏（`packages/core/src/asserts/error.ts:9` 只有类型声明）没有被 Vitest 转换替换，报 `ReferenceError: _throw is not defined`。

另一个新引入的后果：`apply()` 现已要求 `NestifyInstance`，仓内约 10 处 `apply(fastify(), ...)` 的调用不再通过类型检查（运行时正常，但这些文件都在 type check 覆盖范围之外）。

要么在依赖完整的各包上下文中运行测试，要么让根测试环境与构建转换保持一致——补上 `_throw` 的转换，并把 `fastify` 加入根依赖。

### 12. lint 命令无法解析其配置

`pnpm run lint` 在真正开始 lint 之前就失败：

```text
Unsupported named config "oxlint-plugin-typescript/recommended" in extends.
```

`.oxlintrc.json` 把 Oxlint 不支持的 ESLint 风格共享配置名混进了 `extends`。应改为 Oxlint 支持的插件／规则。

### 13. 类型检查失败时构建仍然成功

`pnpm run build` 成功完成，而 `pnpm --filter @nestify-js/core check` 失败。发布路径因此可能产出带有已知 TypeScript 契约错误的包。发布流程应在 build/publish 之前运行一次不会吞掉错误的类型检查（与第 2 项同一根因）。

## P2 —— 发布一致性

### 14. 各包版本不一致

```text
@nestify-js/core    0.6.0
@nestify-js/shared  0.5.4
nestify-js          0.5.4
@nestify-js/swagger 0.2.1
root package        0.2.0
```

另外，`scripts/package-info.ts:56` 的 `syncRootVersion()` 查找的是 `@nestify/core`，而实际包名是 `@nestify-js/core`，所以根版本同步永远找不到 Core。

先决定这些包是否独立版本化；如果这是一次协同的 0.6.0 发布，就同步版本号并修正包名比较逻辑。

## 已执行的验证

```text
Core 类型检查:       通过（P0 的 NestifyInstance/FastifyInstance 错误已消除）
Core 单元测试:       6 个文件通过，42 个用例通过
Cron 生命周期测试:   11 个用例通过（含幂等、重复绑定去重、双应用隔离、长延时分片）
全量 Vitest 运行:    8 个文件通过，7 个套件失败（第 11 项）
仓库根 check:        仍会打印错误并以 0 退出（第 2 项）
示例类型检查:        8 个错误（第 10 项）
构建:                存在类型错误仍然成功（第 13 项）
Lint:                配置解析失败（第 12 项）
```
