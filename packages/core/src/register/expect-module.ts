/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InjectMetadata, InjectToken, ProviderOptions } from '@core/types/injection.js';
import { inspect } from 'node:util';
import { sym, _isArray, _isConstructable, _isObject, _ownKeys, type Constructor, type SSKey } from '@nestify-js/shared';

import { RouteConfig } from '@core/types/index.js';
import { toModuleClass } from '@core/common/utils.js';
import {
  expectArray,
  expectBoolean,
  expectClass,
  expectInjectArg,
  expectKey,
  expectObject,
  expectProviderOptions,
  expectRecord,
  expectString,
  expectOrObject,
  expect,
} from '@core/asserts/index.js';
import { metaGetController, metaGetInject, metaGetModule, metaGetProvider, metaGetRoute } from '@core/register/meta.js';
import ph from './provider.js';

const moduleCache = new Set<any>();
const controllerCache = new Set<any>();
const injectableCache = new Set<any>();

/**
 *
 * A provider should have
 * - provider: an object marking the class as a provider
 * - injections?: a record of class dependencies
 */
export function expectProvider(target: unknown): asserts target is Constructor {
  expectClass(target, `Target is not a class: ${String(target)} ${Object(target).name}`);

  const providerMetadata = metaGetProvider(target);
  expectObject(providerMetadata, `class '${target.name}' is not a provider`);
  // FIXED 取消构造参数后，只校验 provider 标记不再校验 args 数组。
  expect(providerMetadata.isProvider === true, `class '${target.name}': provider metadata is invalid`);

  // If have injections
  const inject = metaGetInject(target);
  if (inject) {
    const msg = `class '${target.name}': Inject metadata should be a record of class dependencies`;
    expectObject(inject, msg);
    expectRecord<InjectMetadata>(inject, (value) => (expectObject(value, msg), expectInjectArg(value.dependency)), msg);
  }
}

/**
 * An injectable should have
 * - same feature as a provider
 * - no features from a controller
 */
export function expectInjectable(target: unknown) {
  if (injectableCache.has(target)) {
    return;
  }
  expectProvider(target);

  // Should not be a controller
  expect(metaGetController(target) === undefined, `@Injectable should not be a controller`);

  injectableCache.add(target);
}

/**
 * A controller should have
 * - same feature as provider
 * - injections?: a record of class dependencies
 * - prefix[]: an array of path prefix
 * - controlled: an object of controller metadata
 * - routes: a record of route metadata
 *   - field: a string/symbol of the method name
 *   - method: a string of HTTP method
 *   - route: an array of path nodes
 *   - opts?: an object of route options
 */
export function expectController(target: unknown) {
  if (controllerCache.has(target)) {
    return;
  }

  expectProvider(target);

  // controller metadata check
  // ! The grammar(including `:param`) is already validated by `splitPath`, this only checks the shape.
  // FIXED 原谓词用 `_isPathNode` 拒绝 `:id` 等合法路由参数，且返回值被忽略所以从未生效；现改为结构性校验。
  const pred = (pathNode: string) => {
    if (typeof pathNode !== 'string' || pathNode === '' || pathNode.includes('/')) {
      return `Path node must be a non-empty string without '/'. But got: [${String(pathNode)}]`;
    }
    return true;
  };

  const controlled = metaGetController(target);
  expectObject(controlled, `class '${target.name}': is not a controller`);
  expectArray(controlled.prefix, `class '${target.name}': prefix should be a string array`, pred);

  const routes = metaGetRoute(target);
  expectObject(routes, `${target.name}: should have routes`);
  expectRecord<RouteConfig>(
    routes,
    (v: RouteConfig) => {
      const basic = v[sym.route.base];
      expectKey(basic.field, `${target.name}: field of this route config should be a string/symbol`);
      expectArray(basic.route, 'Route should be a string array', pred);
      const bodyLimit = v[sym.route.bodyLimit];
      expect(
        bodyLimit === undefined || (typeof bodyLimit === 'number' && bodyLimit > 0),
        `${target.name}: route bodyLimit should be a positive number`,
      );
      expectOrObject(v[sym.route.description], `${target.name}: route description should be an object`);
    },
    `${target.name}: should have a record of route metadata`,
  );

  expectArray(controlled.prefix, 'controller prefix must be a string', (p, i) => {
    if (typeof p !== 'string') {
      return `Prefix should be string[], but the ${i}th element got ${typeof p}`;
    }
    return true;
  });

  controllerCache.add(target);
}

/**
 * Check **Everything** recursively
 * @param target
 * @returns
 */
export function expectModule(target: unknown): asserts target is Constructor {
  if (moduleCache.has(target)) {
    return;
  }
  // & mark before recursing so circular imports do not overflow the stack
  moduleCache.add(target);

  expectClass(target, `Should be a module class, got: ${inspect(target)}`);
  const mm = metaGetModule(target);

  expectString(mm.prefix, 'Module metadata.prefix should be a string');
  expectBoolean(mm.outer, 'Module metadata.outer should be a boolean');

  expectObject(mm, 'Module metadata should be an object');
  if (mm.controllers) {
    expectArray(mm.controllers, 'controllers must be an array');
    mm.controllers.forEach((t) => expectController(t));
  }
  if (mm.providers) {
    expectArray(mm.providers, 'providers must be an array');
    mm.providers.forEach((t) => expectProviderOptions(t));
  }
  if (mm.exports) {
    // & exports must be a subarray of providers
    expectArray(mm.exports, 'exports must be an array', (exported) =>
      mm.providers.includes(exported) ? undefined : 'Exported providers must be a subarray of providers',
    );
    mm.exports.forEach((t) => expectInjectable(t));
  }
  if (mm.imports) {
    expectArray(mm.imports, 'imports must be an array');
    mm.imports.forEach((m) => {
      const moduleClass = toModuleClass(m);
      expectModule(moduleClass);
    });
  }
}

/**
 * @param opts Will only check when it is a class
 * @param apTokens accessible provider tokens
 */
export function expectAccessible(opts: ProviderOptions, apTokens: InjectToken[]) {
  const tks = getDependencyTokens(opts);
  if (!tks) {
    return;
  }

  for (let i = 0; i < tks.length; i++) {
    const includes = apTokens.includes(tks[i]);
    expect(
      includes,
      `${ph.getName(tks[i])}(to ${ph.getName(ph.getToken(opts))}) is not from current/imported/global module`,
    );
  }
}

export function clearExpectCache() {
  moduleCache.clear();
  controllerCache.clear();
  injectableCache.clear();
}

function getDependencyTokens(options: ProviderOptions): InjectToken[] | null {
  if (_isConstructable(options)) {
    return getClassDependencyTokens(options);
  }

  if ('useClass' in options) {
    return getClassDependencyTokens(options.useClass);
  }

  // FIXED `useExisting` 的别名目标现在也参与模块可访问性检查，避免借别名读取未导出/未导入的 provider。
  if ('useExisting' in options) {
    return [ph.getInjectToken(options.useExisting)];
  }

  if ('inject' in options) {
    if (_isArray(options.inject)) {
      // FIXED factory 的依赖 token 同样按身份归一化（类 → 构造函数），与 provider token 保持一致。
      return options.inject.map((arg) => ph.getInjectToken(arg));
    } else {
      return null;
    }
  }

  return null;
}

/**
 * Collect the dependency tokens declared by `@Inject` fields of a class.
 */
function getClassDependencyTokens(cls: Constructor): InjectToken[] | null {
  const injections = metaGetInject(cls);
  if (!_isObject<Record<SSKey, InjectMetadata>>(injections)) {
    return null;
  }

  // FIXED 改用 Reflect.ownKeys 遍历全部自有键，Symbol 命名的 `@Inject` 字段不再被漏检（原先的 Object.values 会跳过它们）。
  const keys = _ownKeys(injections);
  const tokens: InjectToken[] = [];
  for (let i = 0; i < keys.length; i++) {
    const injection = injections[keys[i]];
    if (_isObject<InjectMetadata>(injection)) {
      tokens.push(ph.getInjectToken(injection.dependency));
    }
  }
  return tokens;
}
