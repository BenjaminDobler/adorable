import { RUNTIME_SCRIPTS } from './runtime-scripts';
import type { Kit, FileTree } from './services/kit-types';

export const BASE_FILES: FileTree = {
  'package.json': {
    file: {
      contents: JSON.stringify(
        {
          name: 'generated-app',
          scripts: { start: 'ng serve', build: 'ng build' },
          dependencies: {
            '@angular/animations': '^21.0.0',
            '@angular/common': '^21.0.0',
            '@angular/compiler': '^21.0.0',
            '@angular/core': '^21.0.0',
            '@angular/forms': '^21.0.0',
            '@angular/platform-browser': '^21.0.0',
            '@angular/platform-browser-dynamic': '^21.0.0',
            '@angular/router': '^21.0.0',
            rxjs: '^7.4.0',
            tslib: '^2.3.0',
            'zone.js': '~0.16.0',
          },
          devDependencies: {
            '@angular/build': '^21.0.0',
            '@angular/cli': '^21.0.0',
            '@angular/compiler-cli': '^21.0.0',
            typescript: '~5.9.2',
          },
        },
        null,
        2,
      ),
    },
  },
  'angular.json': {
    file: {
      contents: JSON.stringify(
        {
          $schema: './node_modules/@angular/cli/lib/config/schema.json',
          version: 1,
          newProjectRoot: 'projects',
          projects: {
            app: {
              projectType: 'application',
              schematics: {},
              root: '',
              sourceRoot: 'src',
              prefix: 'app',
              architect: {
                build: {
                  builder: '@angular/build:application',
                  options: {
                    outputPath: 'dist/app',
                    index: 'src/index.html',
                    browser: 'src/main.ts',
                    polyfills: ['zone.js'],
                    tsConfig: 'tsconfig.app.json',
                    optimization: false,
                    assets: [
                      {
                        glob: '**/*',
                        input: 'public',
                      },
                    ],
                    styles: ['src/styles.css'],
                    scripts: [],
                  },
                },
                serve: {
                  builder: '@angular/build:dev-server',
                  options: {
                    buildTarget: 'app:build',
                    hmr: true,
                    allowedHosts: ['all'],
                  },
                },
              },
            },
          },
          defaultProject: 'app',
        },
        null,
        2,
      ),
    },
  },
  'tsconfig.json': {
    file: {
      contents: JSON.stringify(
        {
          compileOnSave: false,
          compilerOptions: {
            baseUrl: './',
            outDir: './dist/out-tsc',
            forceConsistentCasingInFileNames: true,
            strict: true,
            noImplicitOverride: true,
            noPropertyAccessFromIndexSignature: true,
            noImplicitReturns: true,
            noFallthroughCasesInSwitch: true,
            sourceMap: true,
            declaration: false,
            downlevelIteration: true,
            experimentalDecorators: true,
            moduleResolution: 'bundler',
            importHelpers: true,
            target: 'ES2022',
            module: 'ES2022',
            lib: ['ES2022', 'dom'],
          },
          angularCompilerOptions: {
            enableI18nLegacyMessageIdFormat: false,
            strictInjectionParameters: true,
            strictInputAccessModifiers: true,
            strictTemplates: true,
          },
        },
        null,
        2,
      ),
    },
  },
  'tsconfig.app.json': {
    file: {
      contents: JSON.stringify(
        {
          extends: './tsconfig.json',
          compilerOptions: {
            outDir: './dist/out-tsc',
            types: [],
          },
          files: ['src/main.ts'],
          include: ['src/**/*.d.ts'],
        },
        null,
        2,
      ),
    },
  },
  public: {
    directory: {
      '.gitkeep': {
        file: { contents: '' },
      },
    },
  },
  src: {
    directory: {
      'index.html': {
        file: {
          contents: `<!DOCTYPE html>
<html>
<head>
  <title>App</title>
  <base href="./" />
  ${RUNTIME_SCRIPTS}
</head>
<body>
  <app-root></app-root>
</body>
</html>`,
        },
      },
      'main.ts': {
        file: {
          contents: `import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
bootstrapApplication(AppComponent).catch(err => console.error(err));`,
        },
      },
      'styles.css': {
        file: {
          contents: '/* Global styles */',
        },
      },
      app: {
        directory: {
          'app.component.ts': {
            file: {
              contents: `
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html'
})
export class AppComponent {}
              `,
            },
          },
          'app.component.html': {
            file: {
              contents: `<!-- App root template -->`,
            },
          },
        },
      },
    },
  },
};

/**
 * Default Kit - The built-in Angular 21 starter kit
 * This is used when no custom kit is selected
 */
export const DEFAULT_KIT: Kit = {
  id: 'default-angular-21',
  name: 'Default Angular 21',
  description: 'Blank Angular 21 project with standalone components',
  isBuiltIn: true,
  template: {
    type: 'default',
    files: BASE_FILES,
    angularVersion: '21'
  },
  resources: [],
  mcpServerIds: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
};
