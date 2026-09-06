/* eslint-disable @typescript-eslint/no-explicit-any */
// ! I created this file because the decorator type annotations need the types to be in current package, not @nestify-js/shared.

export type OrPromise<T = void> = T | Promise<T>;

export type Constructor<T = any> = new (...args: any[]) => T;

export type AnyFunction = (...args: any[]) => any;

/**
 * string or symbol
 */
export type SSKey = string | symbol;
