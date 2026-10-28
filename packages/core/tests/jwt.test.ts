import { createHmac, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JwtService } from '@core/auth/jwt.js';
import { Controller, Get, JwtGuard, Module, UseGuards, nestify } from '@core/index.js';

const secret = 'test-secret-for-hs256';
const encoder = new TextEncoder();

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function webCryptoKey() {
  return webcrypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function standardToken(header: unknown, payload: unknown) {
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = await webcrypto.subtle.sign('HMAC', await webCryptoKey(), encoder.encode(signingInput));
  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('JwtService HS256 signatures', () => {
  it('creates a standard signature verifiable by Web Crypto', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const jwt = new JwtService({ secret });
    const token = jwt.sign({ sub: 'user' });
    const [header, payload, signature] = token.split('.');
    const input = `${header}.${payload}`;

    expect(JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(signature).toBe(createHmac('sha256', secret).update(input).digest('base64url'));
    const verified = await webcrypto.subtle.verify(
      'HMAC',
      await webCryptoKey(),
      Buffer.from(signature, 'base64url'),
      encoder.encode(input),
    );
    expect(verified).toBe(true);
    expect(jwt.verify(token)).toMatchObject({ sub: 'user', iat: 1767225600 });
  });

  it('verifies a token signed independently by Web Crypto', async () => {
    const jwt = new JwtService({ secret });
    const token = await standardToken({ alg: 'HS256', typ: 'JWT' }, { sub: 'external' });
    expect(jwt.verify(token)).toEqual({ sub: 'external' });
  });

  it('rejects signatures from the previous nonstandard encoding', () => {
    const jwt = new JwtService({ secret });
    const input = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'legacy' })}`;
    const legacy = createHmac('sha256', secret).update(input).digest().toString('binary');
    const token = `${input}.${Buffer.from(legacy, 'utf8').toString('base64url')}`;
    expect(() => jwt.verify(token)).toThrow('Invalid token signature');
  });

  it.each(['HS384', 'HS512', 'RS256', 'none'])('rejects a signed token declaring %s', async (algorithm) => {
    const token = await standardToken({ alg: algorithm, typ: 'JWT' }, { sub: 'user' });
    expect(() => new JwtService({ secret }).verify(token)).toThrow('Unsupported JWT algorithm');
  });

  it.each([{}, null, [], 'header'])('rejects an invalid or missing algorithm header', async (header) => {
    const token = await standardToken(header, { sub: 'user' });
    expect(() => new JwtService({ secret }).verify(token)).toThrow();
  });

  it.each([
    { alg: 'HS256', crit: ['unknown'] },
    { alg: 'HS256', b64: false },
  ])('rejects unsupported critical header parameters', async (header) => {
    const token = await standardToken(header, { sub: 'user' });
    expect(() => new JwtService({ secret }).verify(token)).toThrow('Unsupported JWT header parameters');
  });

  it('rejects malformed or noncanonical header encodings', () => {
    const jwt = new JwtService({ secret });
    expect(() => jwt.verify('!.e30.signature')).toThrow('Invalid JWT header');
    expect(() => jwt.verify('eyJhbGciOiJIUzI1NiJ9=.e30.signature')).toThrow('Invalid JWT header');
    expect(() => jwt.verify(`${Buffer.from('{').toString('base64url')}.e30.signature`)).toThrow('Invalid JWT header');
  });

  it('rejects tampered payloads and incorrect signature lengths', async () => {
    const jwt = new JwtService({ secret });
    const [header, payload, signature] = (await standardToken({ alg: 'HS256' }, { sub: 'user' })).split('.');
    expect(() => jwt.verify(`${header}.${encode({ sub: 'attacker' })}.${signature}`)).toThrow(
      'Invalid token signature',
    );
    expect(() => jwt.verify(`${header}.${payload}.${signature.slice(1)}`)).toThrow('Invalid token signature');
    expect(() => new JwtService({ secret: 'different' }).verify(`${header}.${payload}.${signature}`)).toThrow(
      'Invalid token signature',
    );
  });

  it('rejects unsupported algorithms in default and per-call signing options', () => {
    const jwt = new JwtService({ secret });
    expect(() =>
      // @ts-expect-error unsupported algorithms must not be accepted by the public type
      jwt.sign({}, { algorithm: 'HS512' }),
    ).toThrow('Unsupported JWT algorithm');
    expect(
      () =>
        // @ts-expect-error unsupported algorithms must not be accepted by the public type
        new JwtService({ secret, signOptions: { algorithm: 'RS256' } }),
    ).toThrow('Unsupported JWT algorithm');
  });

  it('protects guarded routes using the same algorithm checks', async () => {
    const jwt = new JwtService({ secret });
    const guard = JwtGuard(jwt);
    @Controller()
    @UseGuards(guard)
    class ControllerClass {
      @Get()
      handle() {
        return { allowed: true };
      }
    }
    @Module({ controllers: [ControllerClass] })
    class App {}
    const app = await nestify(App, { registerGlobalMiddlewares: [guard] });
    try {
      const standard = await standardToken({ alg: 'HS256' }, { sub: 'user' });
      const unsupported = await standardToken({ alg: 'HS512' }, { sub: 'user' });
      const valid = await app.inject({ url: '/', headers: { authorization: `Bearer ${standard}` } });
      const invalid = await app.inject({ url: '/', headers: { authorization: `Bearer ${unsupported}` } });
      expect(valid.statusCode).toBe(200);
      expect(valid.json()).toEqual({ allowed: true });
      expect(invalid.statusCode).not.toBe(200);
    } finally {
      await app.close();
    }
  });
});
