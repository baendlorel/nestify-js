// Export internal utilities
export * from './common/utils.js';

// Export registration internals (useful for testing module registration)
export * as moduleMeta from './register/meta.js';
export { Injector } from './register/lazy-injector.js';

// Export router metadata utilities
export * from './register/route/handler.js';
