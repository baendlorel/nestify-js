import { describe, it, expect } from 'vitest';

import { Body, Params, Query, Raw, Ip, PipeBody, PipeParams, PipeQuery, PipeIp, PipeRaw } from '@nestify-js/core';
import type { PipeOptions } from '@nestify-js/core';
import { sym } from '@nestify-js/shared';
import { metaGet } from '@core/register/meta.js';

/** Read method-level pipe metadata set by @UsePipes */
function getMethodPipes(cls: any, methodName: string): PipeOptions[] | undefined {
  return metaGet<PipeOptions[]>(cls, [sym.pipe.handler, methodName]);
}

describe('Pipe decorators — metadata verification', () => {
  describe('@Body', () => {
    it('should set pipe metadata with PipeBody and correct schema field', () => {
      class Ctrl {
        @Body()
        handler() {}
      }
      const pipes = getMethodPipes(Ctrl, 'handler');
      expect(pipes).toHaveLength(1);
      expect(pipes![0].pipe).toBe(PipeBody);
    });

    it('should merge input schema into body field', () => {
      const inputSchema = { type: 'object' as const, properties: { name: { type: 'string' } } };
      class Ctrl {
        @Body(inputSchema)
        handler() {}
      }
      const pipes = getMethodPipes(Ctrl, 'handler');
      expect(pipes![0].schema).toEqual({ body: inputSchema });
    });

    it('should set response schema when ok schema is provided', () => {
      const inputSchema = { type: 'object' as const };
      const okSchema = { type: 'string' as const };
      class Ctrl {
        @Body(inputSchema, okSchema)
        handler() {}
      }
      const pipes = getMethodPipes(Ctrl, 'handler');
      expect(pipes![0].schema).toEqual({
        body: inputSchema,
        response: { 200: okSchema },
      });
    });
  });

  describe('@Params', () => {
    it('should set pipe metadata with PipeParams', () => {
      class Ctrl {
        @Params()
        handler() {}
      }
      const pipes = getMethodPipes(Ctrl, 'handler');
      expect(pipes).toHaveLength(1);
      expect(pipes![0].pipe).toBe(PipeParams);
    });

    it('should merge input schema into params field', () => {
      const schema = { type: 'object' as const };
      class Ctrl {
        @Params(schema)
        handler() {}
      }
      const pipes = getMethodPipes(Ctrl, 'handler');
      expect(pipes![0].schema).toEqual({ params: schema });
    });
  });

  describe('@Query', () => {
    it('should set pipe metadata with PipeQuery', () => {
      class Ctrl {
        @Query()
        handler() {}
      }
      const pipes = getMethodPipes(Ctrl, 'handler');
      expect(pipes).toHaveLength(1);
      expect(pipes![0].pipe).toBe(PipeQuery);
    });

    it('should merge input schema into querystring field', () => {
      const schema = { type: 'object' as const };
      class Ctrl {
        @Query(schema)
        handler() {}
      }
      const pipes = getMethodPipes(Ctrl, 'handler');
      expect(pipes![0].schema).toEqual({ querystring: schema });
    });
  });

  describe('@Raw', () => {
    it('should set pipe metadata with PipeRaw without schema', () => {
      class Ctrl {
        @Raw()
        handler() {}
      }
      const pipes = getMethodPipes(Ctrl, 'handler');
      expect(pipes).toHaveLength(1);
      expect(pipes![0].pipe).toBe(PipeRaw);
      expect(pipes![0].schema).toBeUndefined();
    });
  });

  describe('@Ip', () => {
    it('should set pipe metadata with PipeIp without schema', () => {
      class Ctrl {
        @Ip()
        handler() {}
      }
      const pipes = getMethodPipes(Ctrl, 'handler');
      expect(pipes).toHaveLength(1);
      expect(pipes![0].pipe).toBe(PipeIp);
      expect(pipes![0].schema).toBeUndefined();
    });
  });

  describe('multiple decorators on the same method', () => {
    it('should accumulate pipe options in order', () => {
      class Ctrl {
        @Body()
        @Params()
        handler() {}
      }
      const pipes = getMethodPipes(Ctrl, 'handler');
      // FIXED 同级装饰器改为追加合并（对齐 NestJS extendArrayMetadata），不再相互覆盖
      // Decorators apply bottom-up: @Params first, then @Body
      expect(pipes).toHaveLength(2);
      expect(pipes![0].pipe).toBe(PipeParams);
      expect(pipes![1].pipe).toBe(PipeBody);
    });
  });
});
