import { _define, type Constructor } from '@nestify-js/shared';
import type { NestifyGuardLike } from '@core/types/middleware.js';
import { JwtService } from './jwt.js';

import { _GuardSet, NestifyGuard } from '@core/decorators/middlewares/guard.js';
import { ExecutionContext } from '@core/common/execution-context.js';
import { jwt as defaultJwt } from './jwt.js';

const guards = new Map<typeof defaultJwt, Constructor<NestifyGuardLike>>();

/**
 * JWT Guard - protects routes by validating JWT tokens
 * - extracts token from Authorization header (Bearer token)
 * - validates token using JwtService
 * - attaches decoded payload to request[sym.user]
 * - this function uses cache and will not create a new instance everytime
 *
 * @param jwt - instance of JwtService to use, omit it to use default jwt instance
 *
 * Usage:
 * ```typescript
 * @Controller('protected')
 * @UseGuards(JwtGuard())
 * class ProtectedController {
 *   @Get('profile')
 *   getProfile(@Req() request: FastifyRequest) {
 *     return request.user; // decoded JWT payload
 *   }
 * }
 * ```
 */
export function JwtGuard(jwt: JwtService = defaultJwt) {
  const guardClass = guards.get(jwt);
  if (guardClass) {
    return guardClass;
  }

  class JwtGuardClass extends NestifyGuard {
    static {}
    canActivate(context: ExecutionContext): boolean {
      const http = context.switchToHttp();
      const request = http.getRequest();

      // Extract token from Authorization header
      const token = this.extractTokenFromHeader(request);

      if (!token) {
        throw new Error('No token provided');
      }

      try {
        // Verify token and attach payload to request
        const payload = jwt.verify(token);

        // Attach user to request object
        JwtService.setUserToRequest(request, payload);

        return true;
      } catch (error) {
        throw new Error(`Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    /**
     * Extract JWT token from Authorization header
     * - Expected format: "Bearer <token>"
     */
    private extractTokenFromHeader(request: any): string | null {
      const authorization = request.headers?.authorization;

      if (!authorization) {
        return null;
      }

      const [type, token] = authorization.split(' ');

      return type === 'Bearer' ? token : null;
    }
  }

  // ! Try to prevent using @Guard
  _GuardSet(JwtGuardClass);

  // & Prevent class name collision in case of multiple guards being created dynamically
  _define(JwtGuardClass, 'name', { value: 'JwtGuardClass' + guards.size, configurable: true });

  guards.set(jwt, JwtGuardClass);
  return JwtGuardClass;
}
