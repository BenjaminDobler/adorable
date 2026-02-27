import { TestBed } from '@angular/core/testing';
import { FileSystemStore } from './file-system.store';
import type { FileTree } from '@adorable/shared-types';

describe('FileSystemStore', () => {
  let store: FileSystemStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(FileSystemStore);
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  describe('setFiles', () => {
    it('should initialize file tree', () => {
      const files: FileTree = {
        'src': {
          directory: {
            'app.ts': { file: { contents: 'console.log("app")' } },
          }
        },
        'package.json': { file: { contents: '{}' } },
      };

      store.setFiles(files);

      expect(store.files()).toEqual(files);
      expect(store.isEmpty()).toBe(false);
    });

    it('should report isEmpty correctly for empty files', () => {
      store.setFiles({});
      expect(store.isEmpty()).toBe(true);
    });
  });

  describe('updateFile', () => {
    beforeEach(() => {
      store.setFiles({
        'src': {
          directory: {
            'app.ts': { file: { contents: 'original' } },
          }
        },
      });
    });

    it('should perform immutable update', () => {
      const originalFiles = store.files();

      store.updateFile('src/app.ts', 'updated content');

      // Original reference should not be mutated
      expect(store.files()).not.toBe(originalFiles);
      expect(store.getFileContent('src/app.ts')).toBe('updated content');
    });

    it('should create nested path if it does not exist', () => {
      store.updateFile('src/components/Button.tsx', 'export const Button = () => null');

      expect(store.getFileContent('src/components/Button.tsx')).toBe('export const Button = () => null');
    });

    it('should create root-level files', () => {
      store.updateFile('README.md', '# My Project');

      expect(store.getFileContent('README.md')).toBe('# My Project');
    });
  });

  describe('deleteFile', () => {
    beforeEach(() => {
      store.setFiles({
        'src': {
          directory: {
            'app.ts': { file: { contents: 'app code' } },
            'main.ts': { file: { contents: 'main code' } },
          }
        },
      });
    });

    it('should remove file from tree', () => {
      store.deleteFile('src/app.ts');

      expect(store.getFileContent('src/app.ts')).toBeNull();
      expect(store.getFileContent('src/main.ts')).toBe('main code');
    });

    it('should handle non-existent file gracefully', () => {
      // Should not throw
      store.deleteFile('src/nonexistent.ts');
      expect(store.getFileContent('src/main.ts')).toBe('main code');
    });
  });

  describe('getFileContent', () => {
    beforeEach(() => {
      store.setFiles({
        'src': {
          directory: {
            'nested': {
              directory: {
                'deep.ts': { file: { contents: 'deep content' } },
              }
            },
            'app.ts': { file: { contents: 'app content' } },
          }
        },
        'root.txt': { file: { contents: 'root content' } },
      });
    });

    it('should retrieve file by path', () => {
      expect(store.getFileContent('src/app.ts')).toBe('app content');
      expect(store.getFileContent('root.txt')).toBe('root content');
    });

    it('should retrieve deeply nested files', () => {
      expect(store.getFileContent('src/nested/deep.ts')).toBe('deep content');
    });

    it('should return null for missing path', () => {
      expect(store.getFileContent('nonexistent.ts')).toBeNull();
      expect(store.getFileContent('src/nonexistent.ts')).toBeNull();
      expect(store.getFileContent('src/nested/nonexistent.ts')).toBeNull();
    });

    it('should return null for directory path', () => {
      expect(store.getFileContent('src')).toBeNull();
      expect(store.getFileContent('src/nested')).toBeNull();
    });
  });
});
