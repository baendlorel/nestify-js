import type { AnyFunction } from '@core/types/primitives.js';
import { expectMethodDecorator, expectString, expectOrString } from '@core/asserts/index.js';
import { metaSetRoute } from '@core/register/meta.js';

function registerRoute(method: string) {
  return function (route?: string) {
    return function (target: AnyFunction, context: ClassMethodDecoratorContext) {
      expectMethodDecorator(target, context);
      expectString(method, 'Method must be a string');
      expectOrString(route, 'Given route must be string or undefined');
      metaSetRoute(context, method, route);
    };
  };
}

export const Get = registerRoute('GET');
export const Post = registerRoute('POST');
export const Patch = registerRoute('PATCH');
export const Put = registerRoute('PUT');
export const Delete = registerRoute('DELETE');
export const HttpMethod = function (method: string) {
  return registerRoute(method.toUpperCase());
};
