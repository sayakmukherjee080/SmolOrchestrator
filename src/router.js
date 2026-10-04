// Top-level request router: health, gateway API, admin API, and static UI.
import { envelopeError, openAiError } from './util/body.js';

// Builds the router bound to all application subsystems.
export function createRouter({ gateway, adminApi, staticServer, db, metrics, registry, config }) {
  return async function handle(request, url) {
    const { pathname } = url;
    const method = request.method.toUpperCase();

    if (pathname === '/health' && method === 'GET') {
      return Response.json({ status: 'ok' });
    }
    if (pathname === '/health/ready' && method === 'GET') {
      try {
        db.prepare('SELECT 1').get();
        return Response.json({ status: 'ready' });
      } catch (error) {
        return Response.json({ status: 'unavailable', error: error.message }, { status: 503 });
      }
    }
    if (pathname === '/metrics' && method === 'GET') {
      const metricsToken = registry.setting('metrics_token', config.metricsToken);
      if (metricsToken) {
        const auth = request.headers.get('authorization') || '';
        if (auth !== `Bearer ${metricsToken}`) {
          return envelopeError('Unauthorized', 'unauthorized', 401);
        }
      }
      return new Response(metrics.render(registry), {
        headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' },
      });
    }
    if (pathname === '/v1/models' && method === 'GET') {
      return gateway.handleModels(request);
    }
    if (pathname.startsWith('/v1/') && method === 'POST') {
      return gateway.handleProxy(request, pathname.slice(3));
    }
    if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) {
      return adminApi.handle(request, url);
    }
    if (pathname.startsWith('/v1/')) {
      return openAiError('Not found', 'not_found', 404, 'invalid_request_error');
    }
    if (pathname === '/') {
      // Built manually because Response.redirect() headers are immutable and security headers are added later.
      return new Response(null, { status: 302, headers: { location: '/admin' } });
    }
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return staticServer.serve(pathname);
    }
    return envelopeError('Not found', 'not_found', 404);
  };
}
