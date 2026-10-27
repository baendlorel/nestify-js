import type { NestifyPipeLike } from '@core/types/middleware.js';
import type { FileUploadMeta, MultipartFile } from '@core/types/multipart.js';

import { sym } from '@nestify-js/shared';
import { NestifyError } from '@core/asserts/error.js';
import { PayloadTooLargeException } from '@core/exceptions/index.js';
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
    // FIXED 即使插件全局关闭了超限异常，文件管道也不能把截断的内容当作成功上传。
    const partOptions = { limits, throwFileSizeLimit: true };

    // Check if multipart plugin is registered
    if (!request.isMultipart || !request.isMultipart()) {
      throw new NestifyError('Request is not multipart/form-data. Did you register @fastify/multipart plugin?');
    }

    try {
      if (multiple) {
        const files: MultipartFile[] = [];
        const parts = request.parts(partOptions);

        for await (const part of parts) {
          if (part.type === 'file') {
            if (!fieldName || part.fieldname === fieldName) {
              const uploadedFile = new UploadedFile(part);
              // FIXED 在交给处理方法前消费流并检查截断，避免部分文件被当作完整文件。
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
        const file = await request.file(partOptions);

        if (!file) {
          _throw(`No file uploaded${fieldName ? ` for field "${fieldName}"` : ''}`);
        }

        if (fieldName && file.fieldname !== fieldName) {
          _throw(`Expected file field "${fieldName}" but got "${file.fieldname}"`);
        }

        const uploadedFile = new UploadedFile(file);
        // FIXED 单文件也先检查大小；即使处理方法不读取文件，也必须拒绝超限上传。
        await uploadedFile.toBuffer();
        return [uploadedFile];
      }
    } catch (e) {
      if (
        e instanceof PayloadTooLargeException ||
        (e instanceof Error && 'code' in e && e.code === 'FST_REQ_FILE_TOO_LARGE')
      ) {
        // FIXED 保留 413 语义，避免被通用上传错误包装为其他状态。
        throw new PayloadTooLargeException('File exceeds the configured size limit');
      }
      if (e instanceof Error) {
        throw new NestifyError(`File upload failed: ${e.message}`);
      }
      throw e;
    }
  }
}

_PipeSet(PipeFile);

export { PipeFile };
