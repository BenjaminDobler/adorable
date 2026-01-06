
export const BASE_FILES = {
  'package.json': {
    file: {
      contents: JSON.stringify({
        name: 'generated-app',
        scripts: { start: 'ng serve', build: 'ng build' },
        dependencies: {
          '@angular/animations': '^18.0.0',
          '@angular/common': '^18.0.0',
          '@angular/compiler': '^18.0.0',
          '@angular/core': '^18.0.0',
          '@angular/forms': '^18.0.0',
          '@angular/platform-browser': '^18.0.0',
          '@angular/platform-browser-dynamic': '^18.0.0',
          '@angular/router': '^18.0.0',
          'rxjs': '~7.8.0',
          'tslib': '^2.3.0',
          'zone.js': '~0.14.3'
        },
        devDependencies: {
          '@angular-devkit/build-angular': '^18.0.0',
          '@angular/cli': '^18.0.0',
          '@angular/compiler-cli': '^18.0.0',
          'typescript': '~5.4.2'
        }
      }, null, 2)
    }
  },
  'angular.json': {
    file: {
      contents: JSON.stringify({
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
                builder: '@angular-devkit/build-angular:browser',
                options: {
                  outputPath: 'dist/app',
                  index: 'src/index.html',
                  main: 'src/main.ts',
                  polyfills: ['zone.js'],
                  tsConfig: 'tsconfig.app.json',
                  assets: [],
                  styles: ['src/styles.css'],
                  scripts: []
                }
              },
              serve: {
                builder: '@angular-devkit/build-angular:dev-server',
                options: {
                  browserTarget: 'app:build'
                }
              }
            }
          }
        },
        defaultProject: 'app'
      }, null, 2)
    }
  },
  'tsconfig.json': {
    file: {
      contents: JSON.stringify({
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
          moduleResolution: 'node',
          importHelpers: true,
          target: 'ES2022',
          module: 'ES2022',
          lib: ['ES2022', 'dom']
        },
        angularCompilerOptions: {
          enableI18nLegacyMessageIdFormat: false,
          strictInjectionParameters: true,
          strictInputAccessModifiers: true,
          strictTemplates: true
        }
      }, null, 2)
    }
  },
  'tsconfig.app.json': {
    file: {
      contents: JSON.stringify({
        extends: './tsconfig.json',
        compilerOptions: {
          outDir: './dist/out-tsc',
          types: []
        },
        files: ['src/main.ts'],
        include: ['src/**/*.d.ts']
      }, null, 2)
    }
  },
  'src': {
    directory: {
      'index.html': {
        file: {
          contents: '<!DOCTYPE html><html><head><title>App</title></head><body><app-root></app-root></body></html>'
        }
      },
      'main.ts': {
        file: {
          contents: `import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
bootstrapApplication(AppComponent).catch(err => console.error(err));`
        }
      },
      'styles.css': {
        file: {
          contents: '/* Global styles */'
        }
      }
    }
  }
};
