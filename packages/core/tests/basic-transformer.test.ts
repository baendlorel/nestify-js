import { describe, it, expect } from 'vitest';

import {
  BasicTransformer,
  PipeBody,
  PipeParams,
  PipeQuery,
  ExecutionContext,
  BadRequestException,
} from '@nestify-js/core';

/** Create a mock ExecutionContext for HTTP requests */
function createMockContext(request: Record<string, any>, reply: any = undefined) {
  return new ExecutionContext([request, reply] as any, 'http', class {} as any, (() => {}) as any);
}

/** Create a fresh BasicTransformer transformer for each test (avoids singleton state leakage) */
function createTransformer() {
  return new BasicTransformer().transformer;
}

describe('basicTransformer', () => {
  describe('without validator compiler', () => {
    it('should return [request.body, reply] for body part', async () => {
      const req = { body: { name: 'test' }, server: {} };
      const reply = { sent: false };
      const ctx = createMockContext(req, reply);

      const result = await createTransformer()(ctx, 'body');
      expect(result).toEqual([{ name: 'test' }, reply]);
    });

    it('should return [request.params, reply] for params part', async () => {
      const req = { params: { id: '42' }, server: {} };
      const ctx = createMockContext(req);

      const result = await createTransformer()(ctx, 'params');
      expect(result).toEqual([{ id: '42' }, undefined]);
    });

    it('should return [request.query, reply] for query part', async () => {
      const req = { query: { page: '1' }, server: {} };
      const ctx = createMockContext(req);

      const result = await createTransformer()(ctx, 'query');
      expect(result).toEqual([{ page: '1' }, undefined]);
    });

    it('should return [request.ip, reply] for ip part', async () => {
      const req = { ip: '127.0.0.1', server: {} };
      const ctx = createMockContext(req);

      const result = await createTransformer()(ctx, 'ip');
      expect(result).toEqual(['127.0.0.1', undefined]);
    });

    it('should return [request.raw, reply] for raw part', async () => {
      const rawObj = { custom: 'data' };
      const req = { raw: rawObj, server: {} };
      const ctx = createMockContext(req);

      const result = await createTransformer()(ctx, 'raw');
      expect(result).toEqual([rawObj, undefined]);
    });
  });

  describe('with validator compiler', () => {
    it('should return original data when validation passes (true)', async () => {
      const mockValidator = (() => true) as any;
      mockValidator.errors = null;
      const req = {
        body: { name: 'test' },
        server: { validatorCompiler: () => mockValidator },
      };
      const ctx = createMockContext(req);
      const schema = { body: { type: 'object' } };

      const result = await createTransformer()(ctx, 'body', schema);
      // true means validation passed, no value replacement
      expect(result).toEqual([{ name: 'test' }, undefined]);
    });

    it('should throw BadRequestException when validation fails (false)', async () => {
      const mockValidator = (() => false) as any;
      mockValidator.errors = [{ message: 'Invalid name' }];
      const req = {
        body: { name: '' },
        server: { validatorCompiler: () => mockValidator },
      };
      const ctx = createMockContext(req);
      const schema = { body: { type: 'object' } };

      await expect(createTransformer()(ctx, 'body', schema)).rejects.toThrow(BadRequestException);
      await expect(createTransformer()(ctx, 'body', schema)).rejects.toThrow(/Invalid name/);
    });

    it('should use transformed value when validator returns { value }', async () => {
      const transformed = { name: 'test', id: 1 };
      const mockValidator = (() => ({ value: transformed })) as any;
      mockValidator.errors = null;
      const req = {
        body: { name: 'test' },
        server: { validatorCompiler: () => mockValidator },
      };
      const ctx = createMockContext(req);
      const schema = { body: { type: 'object' } };

      const result = await createTransformer()(ctx, 'body', schema);
      expect(result[0]).toEqual(transformed);
    });

    it('should not validate when schema is not provided', async () => {
      const mockValidator = (() => false) as any;
      mockValidator.errors = [{ message: 'should not reach' }];
      const req = {
        body: { name: 'test' },
        server: { validatorCompiler: () => mockValidator },
      };
      const ctx = createMockContext(req);

      // No schema → validator is not called
      const result = await createTransformer()(ctx, 'body');
      expect(result).toEqual([{ name: 'test' }, undefined]);
    });

    it('uses the current request compiler even after a schema-less call', async () => {
      const transformer = createTransformer();
      const schema = { body: { type: 'object' } };
      const request = (value: string) => ({
        body: {},
        server: { validatorCompiler: () => () => ({ value }) },
      });

      await transformer(createMockContext(request('unused')), 'body');
      expect((await transformer(createMockContext(request('first')), 'body', schema))[0]).toBe('first');
      expect((await transformer(createMockContext(request('second')), 'body', schema))[0]).toBe('second');
    });

    it('rejects a validator result containing an error array', async () => {
      const req = {
        body: {},
        server: { validatorCompiler: () => () => ({ error: [{ message: 'invalid' }] }) },
      };
      await expect(createTransformer()(createMockContext(req), 'body', { body: {} })).rejects.toThrow(/invalid/);
    });
  });

  describe('through pipe classes', () => {
    it('PipeBody.transform should delegate to basicTransformer with "body"', async () => {
      const req = { body: { data: 123 }, server: {} };
      const ctx = createMockContext(req);
      const pipe = new PipeBody();
      const result = await pipe.transform(ctx);
      expect(result).toEqual([{ data: 123 }, undefined]);
    });

    it('PipeParams.transform should delegate to basicTransformer with "params"', async () => {
      const req = { params: { id: '5' }, server: {} };
      const ctx = createMockContext(req);
      const pipe = new PipeParams();
      const result = await pipe.transform(ctx);
      expect(result).toEqual([{ id: '5' }, undefined]);
    });

    it('PipeQuery.transform should delegate to basicTransformer with "query"', async () => {
      const req = { query: { search: 'hello' }, server: {} };
      const ctx = createMockContext(req);
      const pipe = new PipeQuery();
      const result = await pipe.transform(ctx);
      expect(result).toEqual([{ search: 'hello' }, undefined]);
    });
  });
});
