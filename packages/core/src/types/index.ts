import type { SSKey } from '@nestify-js/shared';
import { sym } from '@nestify-js/shared';

export * from './auth.js';
export * from './injection.js';

export interface RouteBasic {
  field: SSKey;
  method: string;
  route: string[];
}

/**
 * OpenAPI information of one route
 * - only documentation, request schemas belong to the pipes
 */
export interface RouteDescription {
  /** Short summary of the operation */
  summary?: string;
  /** Long description of the operation */
  description?: string;
  /** Tags used to group the operation */
  tags?: string[];
}

export interface RouteConfig {
  [sym.route.base]: RouteBasic;
  [sym.route.bodyLimit]?: number;
  [sym.route.description]?: RouteDescription;
  [sym.route.args]?: string[][];
}
