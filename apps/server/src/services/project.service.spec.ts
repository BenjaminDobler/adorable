import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectService } from './project.service';
import * as fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe('ProjectService', () => {
  const service = new ProjectService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fixBaseHref', () => {
    it('should update base href to relative path', () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <base href="/">
  <title>My App</title>
</head>
<body></body>
</html>`;

      const result = service.fixBaseHref(html);

      expect(result).toContain('<base href="./">');
      expect(result).not.toContain('<base href="/">');
    });

    it('should handle base href with trailing slash', () => {
      const html = '<base href="/my-app/">';
      const result = service.fixBaseHref(html);
      expect(result).toBe('<base href="./">');
    });

    it('should handle self-closing base tag', () => {
      const html = '<base href="/app" />';
      const result = service.fixBaseHref(html);
      expect(result).toBe('<base href="./">');
    });

    it('should handle missing base tag (no change)', () => {
      const html = '<html><head><title>No Base</title></head></html>';
      const result = service.fixBaseHref(html);
      expect(result).toBe(html);
    });
  });

  describe('saveFilesToDisk', () => {
    it('should create correct directory structure', async () => {
      const files = {
        'src': {
          directory: {
            'app.ts': { file: { contents: 'console.log("app")' } },
          }
        },
        'package.json': { file: { contents: '{}' } },
      };

      await service.saveFilesToDisk('/test/path', files);

      expect(fs.mkdir).toHaveBeenCalledWith('/test/path/src', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith('/test/path/src/app.ts', 'console.log("app")');
      expect(fs.writeFile).toHaveBeenCalledWith('/test/path/package.json', '{}');
    });

    it('should handle base64 encoded files', async () => {
      const base64Content = 'SGVsbG8gV29ybGQ='; // "Hello World" in base64
      const files = {
        'image.png': {
          file: { contents: base64Content, encoding: 'base64' }
        },
      };

      await service.saveFilesToDisk('/test/path', files);

      // Should write as Buffer, not string
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/path/image.png',
        Buffer.from(base64Content, 'base64')
      );
    });

    it('should fix base href in index.html', async () => {
      const files = {
        'index.html': { file: { contents: '<base href="/my-app/">' } },
      };

      await service.saveFilesToDisk('/test/path', files);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/path/index.html',
        '<base href="./">'
      );
    });

    it('should not modify non-index.html files', async () => {
      const files = {
        'other.html': { file: { contents: '<base href="/app/">' } },
      };

      await service.saveFilesToDisk('/test/path', files);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/path/other.html',
        '<base href="/app/">'
      );
    });
  });
});
