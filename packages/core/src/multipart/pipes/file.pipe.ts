import type { NestifyPipeLike } from '@core/types/middleware.js';
import type { FileUploadMeta, MultipartFile } from '@core/types/multipart.js';

import { sym } from '@nestify-js/shared';
import { ExecutionContext } from '@core/common/execution-context.js';
import { metaGet } from '@core/register/meta.js';
import { _PipeSet } from '@core/decorators/middlewares/pipe.js';
import { UploadedFile } from '../uploaded-file.js';

/**
 * Pipe for handling file uploads
 * Integrates with @fastify/multipart to process uploaded files
 *
 * Note: Requires @fastify/multipart to be installed and registered with Fastify
 */
class PipeFile implements NestifyPipeLike {
  async transform(context: ExecutionContext, input?: any[]): Promise<any[]> {
    const request = context.switchToHttp().getRequest();
    const sourceClass = context.getClass();
    const handler = context.getHandler();
    const handlerName = handler.name;

    const fileMeta = metaGet<Record<string, FileUploadMeta>>(sourceClass, [sym.file]);

    if (!fileMeta) {
      return input || [];
    }

    const uploadMeta = fileMeta[handlerName];

    if (!uploadMeta) {
      return input || [];
    }
    const { fieldName, multiple, limits } = uploadMeta;

    // Check if multipart plugin is registered
    if (!request.isMultipart || !request.isMultipart()) {
      _throw('Request is not multipart/form-data. Did you register @fastify/multipart plugin?');
    }

    try {
      if (multiple) {
        const files: MultipartFile[] = [];
        const parts = request.parts({ limits });

        for await (const part of parts) {
          if (part.type === 'file') {
            if (!fieldName || part.fieldname === fieldName) {
              const uploadedFile = new UploadedFile(part);
              await uploadedFile.toBuffer();
              files.push(uploadedFile);
            } else {
              await part.file.resume();
            }
          } else {
            continue;
          }
        }

        return [files];
      } else {
        const file = await request.file({ limits });

        if (!file) {
          _throw(`No file uploaded${fieldName ? ` for field "${fieldName}"` : ''}`);
        }

        if (fieldName && file.fieldname !== fieldName) {
          _throw(`Expected file field "${fieldName}" but got "${file.fieldname}"`);
        }

        return [new UploadedFile(file)];
      }
    } catch (error) {
      if (error instanceof Error) {
        _throw(`File upload failed: ${error.message}`);
      }
      throw error;
    }
  }
}

_PipeSet(PipeFile);

export { PipeFile };
