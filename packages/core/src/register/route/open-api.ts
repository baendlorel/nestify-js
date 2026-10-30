import { NestifyError } from '@core/asserts/error.js';
import type { NestifyInstance } from '@core/types/instance.js';

export async function registerOpenApi(app: NestifyInstance, openApi: Array<{ path: string; format: 'json' | 'yaml' }>) {
  if (
    !Array.isArray(openApi) ||
    openApi.some(
      (v) =>
        typeof v !== 'object' ||
        v === null ||
        typeof v.path !== 'string' ||
        v.path.length === 0 ||
        (v.format !== 'json' && v.format !== 'yaml'),
    )
  ) {
    throw new NestifyError('Invalid OpenAPI configuration');
  }

  for (const { path, format } of openApi) {
    await app.route({
      method: 'GET',
      url: path,
      handler: async (request, reply) => {},
    });
  }
}
