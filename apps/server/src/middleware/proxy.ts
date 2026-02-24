import { createProxyMiddleware } from 'http-proxy-middleware';
import * as cookie from 'cookie';
import * as signature from 'cookie-signature';
import { JWT_SECRET } from '../config';
import { containerRegistry } from '../providers/container/container-registry';

// Helper to identify user from various sources (Query, Cookie, Referer)
export const getUserId = (req: any) => {
  try {
    const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    let userId = urlObj.searchParams.get('user');

    if (!userId && req.headers.cookie) {
      const cookies = cookie.parse(req.headers.cookie);
      const rawCookie = cookies['adorable_container_user'];
      if (rawCookie) {
         if (rawCookie.startsWith('s:')) {
            const unsigned = signature.unsign(rawCookie.slice(2), JWT_SECRET);
            if (unsigned) userId = unsigned as string;
         } else {
            userId = rawCookie;
         }
      }
    }

    if (!userId && req.headers.referer) {
       try {
         const refUrl = new URL(req.headers.referer);
         userId = refUrl.searchParams.get('user');
       } catch(e) {}
    }
    return userId;
  } catch (e) {
    return null;
  }
};

// Global Proxy Instance for Containers
export const containerProxy = createProxyMiddleware({
  target: 'http://localhost:3333', // Placeholder, overridden by router
  router: async (req: any) => {
    const userId = getUserId(req);
    if (userId) {
      try {
        const manager = containerRegistry.getManager(userId);
        containerRegistry.updateActivity(userId); // Track Heartbeat
        return await manager.getContainerUrl();
      } catch (e: any) {
        // Suppress known transient errors during container recreation
        const msg = e.message || '';
        const code = e.statusCode;
        if (
          msg.includes('Container not started') ||
          code === 404 || // container removed, not yet recreated
          code === 409    // container marked for removal
        ) {
          return undefined;
        }
        console.error('[Proxy Router] Error:', msg, '| URL:', req.url);
      }
    }
    return undefined;
  },
  changeOrigin: true,
  ws: true,
  pathRewrite: {
    '^/api/proxy': '',
  },
  on: {
    proxyRes: (proxyRes: any) => {
      proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      proxyRes.headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
    },
    error: (err: any, req, res: any) => {
      // Suppress common transient errors (client disconnected, container restarting)
      const code = err?.code;
      if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EPIPE' || code === 'EAGAIN' || code === 'EADDRNOTAVAIL') {
        // Only log at debug level — these are expected when clients close connections
        return;
      }
      console.error('[Proxy Error]', err);
      if (res.writeHead && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Container Proxy Error: ' + err.message);
      }
    }
  }
});
