import { Guard } from '@core/decorators/middlewares/guard.js';
import { ExecutionContext } from '@core/common/execution-context.js';
import { NestifyGuard } from '@core/types/middleware.js';
import { getMethodMetadata, getClassMetadata } from '@core/decorators/custom.js';
import { JwtService } from '@core/index.js';

@Guard()
export class RolesGuard implements NestifyGuard {
  canActivate(context: ExecutionContext): boolean {
    // Get roles from method or class metadata
    const methodRoles = getMethodMetadata<string[]>(context.getClass(), context.getHandler().name, 'roles');
    const classRoles = getClassMetadata<string[]>(context.getClass(), 'roles');
    const requiredRoles = methodRoles || classRoles;

    if (!requiredRoles?.length) {
      // No roles required, allow access
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest();
    const user = JwtService.getUserFromRequest(request);

    if (!user?.role) {
      return false;
    }

    // Check if user has one of the required roles
    return requiredRoles.includes(user.role);
  }
}
