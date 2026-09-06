import { createDecorator } from '../../../packages/core/src/decorators/custom.js';

// Custom decorator for role-based access control
export const Roles = createDecorator<string[]>('roles');
