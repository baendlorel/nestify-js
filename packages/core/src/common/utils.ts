import { type Constructor } from '@nestify-js/shared';
import { DynamicModule } from '@core/types/injection.js';
import { likeModule } from '@core/asserts/index.js';

const PATH_REGEX = /^\/?(:[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+)(\/(:[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+))*$/;

export const _iden = (v: any) => v;

export const _idenErr = (e: any) => {
  throw e;
};

/**
 * Check if the given path is valid and split it into segments.
 * - The path must start with a slash and can only contain alphanumeric characters, slashes,
 * @param p path, can be undefined
 */
export function splitPath(p: string | undefined): string[] {
  if (p === undefined || p === '' || p === '/') {
    return [];
  }

  if (p.endsWith('/')) {
    p = p.replace(/[/]+$/, ''); // Remove trailing slash if present
  }

  if (!PATH_REGEX.test(p)) {
    _throw(`Path must match ${PATH_REGEX.toString()}. But got: [${p}]`);
  }
  return p.split('/').filter((s) => s !== '');
}

// # parameter normalization
export function toDynamicModule(mod: Constructor | DynamicModule): DynamicModule {
  return likeModule(mod)
    ? { moduleClass: mod, isGlobal: false }
    : { moduleClass: mod.moduleClass, isGlobal: mod.isGlobal ?? false };
}

export function toModuleClass(mod: Constructor | DynamicModule): Constructor {
  return likeModule(mod) ? mod : mod.moduleClass;
}

export function createNamedClass(name: string): Constructor {
  return new Function(`return class ${name} {}`)();
}
