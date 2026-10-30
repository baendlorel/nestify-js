import { NestifyError } from './error.js';
import type { InjectArg } from '@core/types/injection.js';

import { inspect } from 'node:util';
import { ReflectDeep } from 'reflect-deep';
import { sym } from '@nestify-js/shared';

import { _isFunction, type Constructor } from '@nestify-js/shared';
import { expectClass, expectObject } from './expect.js';
import { expectClassDecoratorContext } from './decorator-context.js';
import { isInjectToken, isInjectArg, isProviderOptions } from './whether.js';

export const expectInjectToken = (o: any, msg: string) => {
  if (!isInjectToken(o)) {
    throw new NestifyError(msg);
  }
};

export const expectRouted = (context: ClassMethodDecoratorContext) => {
  const o = ReflectDeep.get(context.metadata, [sym.root, sym.route.root, context.name]);
  expectObject(o, 'Should be decorated with route decorators(like @Post) first');
};

export const expectInjectable = (target: Constructor, context: ClassDecoratorContext) => {
  expectClass(target, '@Injectable/@Controller can only be used on classes');
  expectClassDecoratorContext(context, '@Injectable/@Controller can only be used on classes');
  expectNotDecorated(context, sym.provider);
};

export const expectModulable = (target: Constructor, context: ClassDecoratorContext) => {
  expectClass(target, '@Module can only be used on classes');
  expectClassDecoratorContext(context, '@Module can only be used on classes');
  expectNotDecorated(context, sym.module);
};

export const expectNotDecorated = (context: DecoratorContext, flag: symbol) => {
  if (ReflectDeep.has(context.metadata, [sym.root, flag])) {
    throw new NestifyError(`'${String(context.name)}' is already decorated`);
  }
};

export const expectClassNotDecorated = (cls: Constructor, flag: symbol) => {
  if (ReflectDeep.has(cls, [sym.metadata, sym.root, flag])) {
    throw new NestifyError(`'${String(cls.name)}' is already decorated`);
  }
};

export const expectInjectArg = (target: InjectArg, msg?: string) => {
  if (!isInjectArg(target)) {
    throw new NestifyError(
      `${msg} Should be an InjectArg(string | symbol | Class | (() => Class)), got: ${inspect(target)}`,
    );
  }
};

export const expectProviderOptions = (target: unknown) => {
  if (!isProviderOptions(target)) {
    throw new NestifyError(`Should be a provider options object, got: ${inspect(target)}`);
  }
};
