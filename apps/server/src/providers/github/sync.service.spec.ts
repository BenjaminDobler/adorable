import { describe, it, expect } from 'vitest';
import { GitHubSyncService } from './sync.service';
import type { WebContainerFiles } from '@adorable/shared-types';

describe('GitHubSyncService', () => {
  const service = new GitHubSyncService();

  describe('flattenFiles', () => {
    it('should convert nested structure to flat paths', () => {
      const files: WebContainerFiles = {
        'src': {
          directory: {
            'app': {
              directory: {
                'app.ts': { file: { contents: 'console.log("hello")' } },
                'app.html': { file: { contents: '<h1>Hello</h1>' } },
              }
            },
            'main.ts': { file: { contents: 'import { app } from "./app"' } },
          }
        },
        'package.json': { file: { contents: '{"name": "app"}' } },
      };

      const result = service.flattenFiles(files);

      expect(result).toHaveLength(4);
      expect(result).toContainEqual({ path: 'src/app/app.ts', content: 'console.log("hello")', encoding: 'utf-8' });
      expect(result).toContainEqual({ path: 'src/app/app.html', content: '<h1>Hello</h1>', encoding: 'utf-8' });
      expect(result).toContainEqual({ path: 'src/main.ts', content: 'import { app } from "./app"', encoding: 'utf-8' });
      expect(result).toContainEqual({ path: 'package.json', content: '{"name": "app"}', encoding: 'utf-8' });
    });

    it('should handle empty directories', () => {
      const files: WebContainerFiles = {
        'src': {
          directory: {
            'empty': { directory: {} },
            'file.ts': { file: { contents: 'content' } },
          }
        },
      };

      const result = service.flattenFiles(files);

      // Empty directories are skipped, only files are included
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ path: 'src/file.ts', content: 'content', encoding: 'utf-8' });
    });

    it('should preserve file contents exactly', () => {
      const multilineContent = `function hello() {
  console.log("world");
  return true;
}`;
      const files: WebContainerFiles = {
        'index.ts': { file: { contents: multilineContent } },
      };

      const result = service.flattenFiles(files);

      expect(result[0].content).toBe(multilineContent);
    });

    it('should mark base64 encoded files correctly', () => {
      const files: WebContainerFiles = {
        'image.png': {
          file: {
            contents: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            encoding: 'base64',
          } as any,
        },
        'text.txt': { file: { contents: 'hello' } },
      };

      const result = service.flattenFiles(files);

      const imageFile = result.find(f => f.path === 'image.png');
      const textFile = result.find(f => f.path === 'text.txt');

      expect(imageFile?.encoding).toBe('base64');
      expect(textFile?.encoding).toBe('utf-8');
    });
  });

  describe('unflattenFiles', () => {
    it('should reconstruct nested structure from flat paths', () => {
      const flatFiles = [
        { path: 'src/app/app.ts', content: 'app code', encoding: 'utf-8' as const },
        { path: 'src/main.ts', content: 'main code', encoding: 'utf-8' as const },
        { path: 'package.json', content: '{}', encoding: 'utf-8' as const },
      ];

      const result = service.unflattenFiles(flatFiles);

      expect(result['package.json']).toEqual({ file: { contents: '{}' } });
      expect(result['src']).toBeDefined();
      expect(result['src'].directory?.['main.ts']).toEqual({ file: { contents: 'main code' } });
      expect(result['src'].directory?.['app']).toBeDefined();
      expect(result['src'].directory?.['app'].directory?.['app.ts']).toEqual({ file: { contents: 'app code' } });
    });

    it('should create intermediate directories automatically', () => {
      const flatFiles = [
        { path: 'a/b/c/d/file.ts', content: 'deep file', encoding: 'utf-8' as const },
      ];

      const result = service.unflattenFiles(flatFiles);

      expect(result['a']).toBeDefined();
      expect(result['a'].directory?.['b']).toBeDefined();
      expect(result['a'].directory?.['b'].directory?.['c']).toBeDefined();
      expect(result['a'].directory?.['b'].directory?.['c'].directory?.['d']).toBeDefined();
      expect(result['a'].directory?.['b'].directory?.['c'].directory?.['d'].directory?.['file.ts']).toEqual({
        file: { contents: 'deep file' }
      });
    });

    it('should preserve base64 encoding for binary files', () => {
      const flatFiles = [
        { path: 'image.png', content: 'base64content', encoding: 'base64' as const },
      ];

      const result = service.unflattenFiles(flatFiles);

      expect(result['image.png']).toEqual({
        file: { contents: 'base64content', encoding: 'base64' }
      });
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve structure through flatten and unflatten', () => {
      const original: WebContainerFiles = {
        'src': {
          directory: {
            'components': {
              directory: {
                'Button.tsx': { file: { contents: 'export const Button = () => <button/>' } },
                'Input.tsx': { file: { contents: 'export const Input = () => <input/>' } },
              }
            },
            'index.ts': { file: { contents: 'export * from "./components"' } },
          }
        },
        'package.json': { file: { contents: '{"name": "test"}' } },
        'README.md': { file: { contents: '# Test Project' } },
      };

      const flattened = service.flattenFiles(original);
      const restored = service.unflattenFiles(flattened);

      // Verify structure is preserved
      expect(restored['package.json']).toEqual(original['package.json']);
      expect(restored['README.md']).toEqual(original['README.md']);
      expect(restored['src'].directory?.['index.ts']).toEqual(original['src'].directory?.['index.ts']);
      expect(restored['src'].directory?.['components'].directory?.['Button.tsx'])
        .toEqual(original['src'].directory?.['components'].directory?.['Button.tsx']);
    });
  });

  describe('generatePagesWorkflow', () => {
    it('should generate valid workflow with repo name', () => {
      const workflow = service.generatePagesWorkflow('my-app');

      expect(workflow).toContain('Deploy to GitHub Pages');
      expect(workflow).toContain('--base-href=/my-app/');
      expect(workflow).toContain('uses: actions/checkout@v4');
      expect(workflow).toContain('uses: actions/deploy-pages@v4');
    });

    it('should handle repo names with special characters', () => {
      const workflow = service.generatePagesWorkflow('my-cool-app-2024');

      expect(workflow).toContain('--base-href=/my-cool-app-2024/');
    });
  });
});
