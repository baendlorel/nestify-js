import type { SSKey } from '@nestify-js/shared';
import { sym } from '@nestify-js/shared';

export * from './auth.js';
export * from './injection.js';

export interface RouteBasic {
  field: SSKey;
  method: string;
  route: string[];
}

export interface RouteConfig {
  [sym.route.base]: RouteBasic;
  [sym.route.args]?: string[][];
}
