import { type Constructor } from '@nestify-js/shared';
import { expectClass, expectInjectable } from '@core/asserts/index.js';
import { metaSetProvider, metaSetProviderOnClass } from '@core/register/meta.js';

export function _Injectable(target: Constructor, context: ClassDecoratorContext) {
  expectInjectable(target, context);
  metaSetProvider(context);
}

/**
 * Use on services, configurations, etc.
 */
export function Injectable() {
  return _Injectable;
}

export function toInjectable(target: Constructor) {
  expectClass(target, `Target is not a class: ${String(target)} ${Object(target).name}`);
  // FIXED 取消 args 支持：需要预置构造参数时，请改用 factory provider。
  metaSetProviderOnClass(target);
  return target;
}
