export const BASE_FILES = {
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
                    assets: [
                      {
                        "glob": "**/*",
                        "input": "public"
                      }
                    ],
                    styles: ['src/styles.css'],
                    scripts: [],
                  },
                },
              serve: {
                builder: '@angular/build:dev-server',
                options: {
                  buildTarget: 'app:build',
                  hmr: false,
                  allowedHosts: ["all"]
                }
              }
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
  'public': {
    directory: {
      '.gitkeep': {
        file: { contents: '' }
      }
    }
  },
  src: {
    directory: {
      'index.html': {
        file: {
          contents: `<!DOCTYPE html>
<html>
<head>
  <title>App</title>
  <base href="/" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
          <script>
    // Visual Inspector Script
    (function() {
      let active = false;
      let overlay;

      function createOverlay() {
        if (document.getElementById('inspector-overlay')) return;
        overlay = document.createElement('div');
        overlay.id = 'inspector-overlay';
        overlay.style.position = 'fixed';
        overlay.style.border = '2px solid #3ecf8e'; // Angular Green
        overlay.style.backgroundColor = 'rgba(62, 207, 142, 0.2)';
        overlay.style.zIndex = '999999';
        overlay.style.pointerEvents = 'none';
        overlay.style.display = 'none';
        overlay.style.transition = 'all 0.1s ease';
        document.body.appendChild(overlay);
      }

      window.addEventListener('message', (event) => {
        if (event.data.type === 'TOGGLE_INSPECTOR') {
          active = event.data.enabled;
          createOverlay();
          if (!active && overlay) overlay.style.display = 'none';
        }
        
        if (event.data.type === 'RELOAD_REQ') {
           window.location.reload();
        }
      });

      // Inspector Events
      document.addEventListener('mouseover', (e) => {
        if (!active) return;
        const target = e.target;
        const overlayEl = document.getElementById('inspector-overlay');
        if (!overlayEl || target === overlayEl || target === document.body || target === document.documentElement) return;

        const rect = target.getBoundingClientRect();
        overlayEl.style.top = rect.top + 'px';
        overlayEl.style.left = rect.left + 'px';
        overlayEl.style.width = rect.width + 'px';
        overlayEl.style.height = rect.height + 'px';
        overlayEl.style.display = 'block';
      });

      document.addEventListener('click', (e) => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();
        
        const target = e.target;
        let componentName = null;
        
        // Attempt to find Angular Component
        if (window.ng) {
           let comp = window.ng.getComponent(target);
           if (!comp) comp = window.ng.getOwningComponent(target);
           
           if (comp && comp.constructor) {
              componentName = comp.constructor.name;
           }
        }

        const computedStyle = window.getComputedStyle(target);
        
        window.parent.postMessage({
          type: 'ELEMENT_SELECTED',
          payload: {
            tagName: target.tagName.toLowerCase(),
            text: target.innerText ? target.innerText.substring(0, 100) : '',
            componentName: componentName,
            classes: target.className,
            styles: {
                color: computedStyle.color,
                backgroundColor: computedStyle.backgroundColor,
                borderRadius: computedStyle.borderRadius,
                fontSize: computedStyle.fontSize,
                padding: computedStyle.padding,
                margin: computedStyle.margin
            }
          }
        }, '*');
        
        active = false;
        const overlayEl = document.getElementById('inspector-overlay');
        if (overlayEl) overlayEl.style.display = 'none';
      });
    })();
    
    // Screenshot logic (Global scope is fine/needed for html2canvas check if loaded separately)
    window.addEventListener('message', async (event) => {
      if (event.data.type === 'CAPTURE_REQ') {
        const { x, y, width, height } = event.data.rect;
        try {
          if (typeof html2canvas === 'undefined') throw new Error('html2canvas not loaded');
          const canvas = await html2canvas(document.body, { x, y, width, height, useCORS: true, logging: false });
          window.parent.postMessage({ type: 'CAPTURE_RES', image: canvas.toDataURL('image/png') }, '*');
        } catch (err) { console.error(err); }
      }
    });
  </script>


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
      'app': {
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
  template: \`
    <div style="text-align: center; padding: 2rem; font-family: system-ui;">
      <h1>Welcome to Adorable</h1>
      <p>Enter a prompt to start building your app!</p>
    </div>
  \`
})
export class AppComponent {}
              `
            }
          }
        }
      }
    },
  },
};
