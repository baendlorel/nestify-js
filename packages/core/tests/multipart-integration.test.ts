import multipart from '@fastify/multipart';
import { describe, expect, it } from 'vitest';
import { Controller, File, Files, Module, PipeFile, Post, nestify, type MultipartFile } from '@core/index.js';

const payload = (content: string) =>
  `--boundary\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--boundary--\r\n`;

describe('multipart file size limits', () => {
  @Controller()
  class ControllerClass {
    @Post('single')
    @File({ limits: { fileSize: 3 } })
    async single(file: MultipartFile) {
      return { size: (await file.toBuffer()).length };
    }

    @Post('multiple')
    @Files({ limits: { fileSize: 3 } })
    async multiple(files: MultipartFile[]) {
      return { size: (await files[0].toBuffer()).length };
    }

    @Post('stream')
    @File({ limits: { fileSize: 3 } })
    async stream(file: MultipartFile) {
      let size = 0;
      for await (const chunk of file.file) size += chunk.length;
      return { size };
    }

    @Post('unread')
    @File({ limits: { fileSize: 3 } })
    unread() {
      return { size: 2 };
    }

    @Post('count')
    @Files({ limits: { files: 1, fileSize: 1024 } })
    count(files: MultipartFile[]) {
      return { n: files.length };
    }
  }
  @Module({ controllers: [ControllerClass], providers: [PipeFile] })
  class App {}

  for (const route of ['single', 'multiple', 'stream', 'unread']) {
    it(`rejects oversized ${route} uploads, even when the plugin disables size errors`, async () => {
      const app = await nestify(App, { plugins: [[multipart, { throwFileSizeLimit: false }]] });
      try {
        const request = (content: string) =>
          app.inject({
            method: 'POST',
            url: `/${route}/`,
            headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
            payload: payload(content),
          });
        const valid = await request('ab');
        expect(valid.statusCode).toBe(200);
        expect(valid.json()).toEqual({ size: 2 });
        const boundary = await request('abc');
        expect(boundary.statusCode).toBe(200);
        expect(boundary.json()).toEqual({ size: route === 'unread' ? 2 : 3 });
        const large = await request('abcdef');
        expect(large.statusCode).toBe(413);
        expect(large.json().message).toContain('size limit');
      } finally {
        await app.close();
      }
    });
  }

  it('rejects uploads exceeding the file count limit with 413', async () => {
    const app = await nestify(App, { plugins: [[multipart, {}]] });
    try {
      const body = [
        '--boundary\r\nContent-Disposition: form-data; name="f"; filename="a.txt"\r\n\r\nA\r\n',
        '--boundary\r\nContent-Disposition: form-data; name="f"; filename="b.txt"\r\n\r\nB\r\n',
        '--boundary--\r\n',
      ].join('');
      const response = await app.inject({
        method: 'POST',
        url: '/count/',
        headers: { 'content-type': 'multipart/form-data; boundary=boundary' },
        payload: body,
      });
      expect(response.statusCode).toBe(413);
      expect(response.json().message).toContain('count limits');
    } finally {
      await app.close();
    }
  });
});
