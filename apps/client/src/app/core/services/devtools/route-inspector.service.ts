import { Injectable, inject, signal } from '@angular/core';
import { CdpService } from './cdp.service';
import { RouteNode } from './devtools.types';

@Injectable({
  providedIn: 'root',
})
export class RouteInspectorService {
  private cdp = inject(CdpService);

  routeTree = signal<RouteNode[]>([]);
  activeRoute = signal<string>('');

  async fetchRouteTree(): Promise<void> {
    try {
      const result = await this.cdp.evaluate(`
        (function() {
          if (!window.ng) return { routes: [], url: '' };

          // Find the root element
          var root = document.querySelector('[ng-version]')
            || document.querySelector('app-root')
            || document.querySelector('[_ong]');
          if (!root && window.ng.getRootComponents) {
            try {
              var rc = window.ng.getRootComponents();
              if (rc && rc.length > 0 && window.ng.getHostElement) {
                root = window.ng.getHostElement(rc[0]);
              }
            } catch(e) {}
          }
          if (!root) return { routes: [], url: '' };

          var inj = window.ng.getInjector(root);
          if (!inj) return { routes: [], url: '' };

          // Find router instance
          var router = null;
          var injList = [inj];
          if (window.ng.ɵgetInjectorResolutionPath) {
            try {
              var path = window.ng.ɵgetInjectorResolutionPath(inj);
              if (path) {
                for (var ri = 0; ri < path.length; ri++) {
                  if (path[ri] !== inj) injList.push(path[ri]);
                }
              }
            } catch(e) {}
          }

          for (var ii = 0; ii < injList.length && !router; ii++) {
            var si = injList[ii];
            if (window.ng.ɵgetRouterInstance) {
              try {
                router = window.ng.ɵgetRouterInstance(si);
                if (router) break;
              } catch(e) {}
            }
            if (window.ng.ɵgetInjectorProviders) {
              try {
                var pp = window.ng.ɵgetInjectorProviders(si);
                for (var pi = 0; pi < pp.length; pi++) {
                  try {
                    var v = si.get(pp[pi].token);
                    if (v && v.config && typeof v.url !== 'undefined') {
                      router = v;
                      break;
                    }
                  } catch(e) {}
                }
              } catch(e) {}
            }
          }

          if (!router) return { routes: [], url: '' };

          // Build route tree recursively
          function buildTree(configs, currentUrl) {
            if (!configs) return [];
            return configs.map(function(c) {
              var guards = [];
              if (c.canActivate) guards = guards.concat(c.canActivate.map(function(g) { return g.name || 'guard'; }));
              if (c.canDeactivate) guards = guards.concat(c.canDeactivate.map(function(g) { return g.name || 'guard'; }));

              var routePath = c.path || '';
              var fullPath = '/' + routePath;
              var isActive = currentUrl === fullPath
                || (routePath && currentUrl.startsWith(fullPath + '/'));

              var children = [];
              if (c.children) children = buildTree(c.children, currentUrl);
              // Check for lazy-loaded routes
              if (c._loadedRoutes && window.ng.ɵgetLoadedRoutes) {
                try {
                  var loaded = window.ng.ɵgetLoadedRoutes(c);
                  if (loaded && loaded.length > 0) {
                    children = children.concat(buildTree(loaded, currentUrl));
                  }
                } catch(e) {}
              }

              return {
                path: routePath || '(root)',
                component: c.component ? c.component.name : '',
                active: isActive,
                guards: guards,
                lazy: !!c.loadComponent || !!c.loadChildren,
                children: children
              };
            });
          }

          return {
            routes: buildTree(router.config, router.url || ''),
            url: router.url || ''
          };
        })()
      `);

      if (result && typeof result === 'object') {
        if (result.routes) this.routeTree.set(result.routes as RouteNode[]);
        if (result.url) this.activeRoute.set(result.url);
      }
    } catch (err) {
      console.error('[RouteInspectorService] fetchRouteTree failed:', err);
    }
  }

  updateActiveRoute(route: string): void {
    this.activeRoute.set(route);
    this.routeTree.update((tree) => {
      function markActive(nodes: RouteNode[]): RouteNode[] {
        return nodes.map((n) => {
          const fullPath = '/' + (n.path === '(root)' ? '' : n.path);
          const isActive =
            route === fullPath ||
            (n.path !== '(root)' && route.startsWith(fullPath + '/')) ||
            (n.path === '(root)' && route === '/');
          return {
            ...n,
            active: isActive,
            children: markActive(n.children),
          };
        });
      }
      return markActive(tree);
    });
  }
}
