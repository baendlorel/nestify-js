import { createHmac } from 'node:crypto';
import type { FastifyRequest as NestifyRequest } from 'fastify';
import type { JwtPayload, JwtSignOptions, JwtVerifyOptions, JwtModuleOptions } from '@core/types/auth.js';
import { _set, sym, _get, _isObject, _isArray } from '@nestify-js/shared';

import { UnauthorizedException } from '@core/exceptions/index.js';

/**
 * Simple JWT Service implementation
 * - Uses Node.js built-in crypto for signing and verification
 * - Supports HS256 algorithm by default
 */
export class JwtService {
  // # actually static but not static methods
  /**
   * Set user info into request object.
   */
  static setUserToRequest(request: NestifyRequest, user: any): boolean {
    return _set(request, sym.user, user);
  }

  static getUserFromRequest<T = any>(request: NestifyRequest): T {
    return _get(request, sym.user) as T;
  }

  // # privates
  private secret: string | null;
  private signOptions: JwtSignOptions;
  private verifyOptions: JwtVerifyOptions;

  constructor(options?: JwtModuleOptions) {
    this.secret = options?.secret || null;
    this.signOptions = this.validateSignOptions(options?.signOptions ?? {});
    this.verifyOptions = options?.verifyOptions ?? {};
  }

  /**
   * Configure JWT service after initialization
   * - Allows setting/changing secret and default options
   */
  configure(options: JwtModuleOptions): void {
    this.secret = options.secret;
    this.signOptions = this.validateSignOptions(options.signOptions ?? {});
    this.verifyOptions = options.verifyOptions ?? {};
  }

  /**
   * Is verified in `this.validateSignOptions`
   */
  get expiresIn(): number {
    return this.signOptions.expiresIn as number;
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(str: string): string {
    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  /**
   * Base64 URL decode
   */
  private base64UrlDecode(str: string): string {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    while (str.length % 4) {
      str += '=';
    }
    return Buffer.from(str, 'base64').toString('utf-8');
  }

  /**
   * Create HMAC signature using Node.js crypto
   */
  private createSignature(data: string, secret: string | null): string {
    if (secret === null) {
      throw new Error('[Nestify] Secret is not set');
    }
    const hmac = createHmac('sha256', secret);
    hmac.update(data);
    return this.base64UrlEncode(hmac.digest().toString('binary'));
  }

  private validateSignOptions(options: JwtSignOptions): JwtSignOptions {
    if (!_isObject<JwtSignOptions>(options)) {
      throw new Error('signOptions must be an object');
    }

    if (options.expiresIn !== undefined) {
      if (!Number.isSafeInteger(options.expiresIn) || options.expiresIn <= 0) {
        throw new Error('expiresIn must be a positive finite number representing seconds');
      }
    }

    return options;
  }

  /**
   * Sign a payload and return JWT token
   */
  sign(payload: JwtPayload, options?: JwtSignOptions): string {
    const opts = this.validateSignOptions({ ...this.signOptions, ...options });

    // Create header
    const header = {
      alg: opts.algorithm || 'HS256',
      typ: 'JWT',
    };

    // Create payload with standard claims
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload: JwtPayload = {
      ...payload,
      iat: now, // issued at
    };

    // Add optional claims
    if (opts.expiresIn) {
      jwtPayload.exp = now + opts.expiresIn;
    }

    if (opts.audience) {
      jwtPayload.aud = opts.audience;
    }

    if (opts.issuer) {
      jwtPayload.iss = opts.issuer;
    }

    if (opts.subject) {
      jwtPayload.sub = opts.subject;
    }

    if (opts.jwtid) {
      jwtPayload.jti = opts.jwtid;
    }

    if (opts.notBefore) {
      if (typeof opts.notBefore === 'number') {
        jwtPayload.nbf = now + opts.notBefore;
      } else {
        jwtPayload.nbf = now + Number(opts.notBefore);
      }
    }

    // Encode header and payload
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(jwtPayload));

    // Create signature
    const signature = this.createSignature(`${encodedHeader}.${encodedPayload}`, this.secret);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Verify and decode a JWT token
   */
  verify<T = JwtPayload>(token: string, options?: JwtVerifyOptions): T {
    const mergedOptions = { ...this.verifyOptions, ...options };

    // Split token
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Verify signature
    const expectedSignature = this.createSignature(`${encodedHeader}.${encodedPayload}`, this.secret);

    if (signature !== expectedSignature) {
      throw new Error('Invalid token signature');
    }

    // Decode payload
    const payload = JSON.parse(this.base64UrlDecode(encodedPayload)) as JwtPayload;

    // Verify claims
    const now = Math.floor(Date.now() / 1000);

    // Check expiration
    if (!mergedOptions.ignoreExpiration && payload.exp) {
      const clockTolerance = mergedOptions.clockTolerance || 0;
      if (now > payload.exp + clockTolerance) {
        throw new UnauthorizedException('Token expired');
      }
    }

    // Check not before
    if (payload.nbf) {
      const clockTolerance = mergedOptions.clockTolerance || 0;
      if (now < payload.nbf - clockTolerance) {
        throw new UnauthorizedException('Token not yet valid');
      }
    }

    // Check audience
    if (mergedOptions.audience) {
      const audiences = _isArray(mergedOptions.audience) ? mergedOptions.audience : [mergedOptions.audience];
      const tokenAudiences = _isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];

      if (!audiences.some((aud) => tokenAudiences.includes(aud))) {
        throw new UnauthorizedException('Token audience mismatch');
      }
    }

    // Check issuer
    if (mergedOptions.issuer) {
      const issuers = _isArray(mergedOptions.issuer) ? mergedOptions.issuer : [mergedOptions.issuer];

      if (!issuers.includes(payload.iss)) {
        throw new UnauthorizedException('Token issuer mismatch');
      }
    }

    return payload as T;
  }

  /**
   * Decode a JWT token without verification
   */
  decode<T = JwtPayload>(token: string): T | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = JSON.parse(this.base64UrlDecode(parts[1]));
      return payload as T;
    } catch {
      return null;
    }
  }
}

/**
 * This is a JwtService instance, you can use `jwt.configure` to set options.
 */
export const jwt = new JwtService();
