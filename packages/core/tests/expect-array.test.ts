import { describe, expect, it } from 'vitest';
import { expectArray } from '@core/asserts/index.js';
import { Injectable, Module, nestify } from '@core/index.js';

describe('expectArray', () => {
  it('throws the message returned by the predicate', () => {
    expect(() => expectArray([1], 'bad', () => 'invalid')).toThrow('invalid');
  });

  it('throws the outer message when the predicate returns false', () => {
    expect(() => expectArray([1], 'bad', () => false)).toThrow('bad');
  });

  it('accepts elements the predicate approves', () => {
    expect(() => expectArray([1, 2], 'bad', () => true)).not.toThrow();
    expect(() => expectArray([1], 'bad', () => undefined)).not.toThrow();
  });

  it('propagates assertions thrown by the predicate', () => {
    expect(() =>
      expectArray([1], 'bad', () => {
        throw new Error('inner');
      }),
    ).toThrow('inner');
  });

  it('rejects a module that exports a provider it does not declare', async () => {
    @Injectable()
    class Declared {}

    @Injectable()
    class Exported {}

    @Module({ providers: [Declared], exports: [Exported] })
    class BadModule {}

    await expect(nestify(BadModule)).rejects.toThrow(/subarray of providers/);
  });
});
