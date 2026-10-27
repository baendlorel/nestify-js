import { Readable } from 'stream';
import type { MultipartFile as FastifyMultipartFile } from '@fastify/multipart';
import { MultipartFile } from '@core/types/multipart.js';
import { PayloadTooLargeException } from '@core/exceptions/index.js';

/**
 * Wrapper class for uploaded files
 * Provides a clean interface for handling multipart files
 */
export class UploadedFile implements MultipartFile {
  fieldname: string;
  filename: string;
  encoding: string;
  mimetype: string;
  file: Readable;

  private _buffer?: Buffer;
  private readonly fastifyFile: FastifyMultipartFile;

  constructor(fastifyFile: FastifyMultipartFile) {
    this.fastifyFile = fastifyFile;
    this.fieldname = fastifyFile.fieldname;
    this.filename = fastifyFile.filename;
    this.encoding = fastifyFile.encoding;
    this.mimetype = fastifyFile.mimetype;
    this.file = fastifyFile.file;
  }

  /**
   * Convert the file stream to a buffer
   * The buffer is cached after first call
   */
  async toBuffer(): Promise<Buffer> {
    if (this._buffer) {
      return this._buffer;
    }

    try {
      const buffer = await this.fastifyFile.toBuffer();
      // FIXED 插件允许关闭超限异常，因此仍需检查 truncated，防止静默返回不完整内容。
      if (this.fastifyFile.file.truncated) {
        throw new PayloadTooLargeException('File exceeds the configured size limit');
      }
      this._buffer = buffer;
      // FIXED 原始流已在检查时被消费，提供缓冲内容的新流以保留 file 的读取能力。
      this.file = Readable.from(buffer);
      return buffer;
    } catch (e) {
      // FIXED 将插件的超限错误转换为框架的 413 异常，供过滤器统一处理。
      if (e instanceof Error && 'code' in e && e.code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new PayloadTooLargeException('File exceeds the configured size limit');
      }
      throw e;
    }
  }
}
