// Serves the admin UI static assets from the web directory.
import fs from 'node:fs';
import path from 'node:path';
import { envelopeError } from '../util/body.js';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.json', 'application/json'],
]);

export function createStaticServer({ webRoot }) {
  const root = path.resolve(webRoot);

  // Resolves a UI request path to a file inside the web root, or null.
  function resolveFile(urlPath) {
    let rel = urlPath.replace(/^\/admin\/?/, '');
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    if (!path.extname(rel)) rel = 'index.html';
    const target = path.resolve(root, rel);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
    return target;
  }

  // Returns the response for an admin UI request.
  async function serve(urlPath) {
    const target = resolveFile(urlPath);
    if (!target) return envelopeError('Not found', 'not_found', 404);
    const data = fs.readFileSync(target);
    return new Response(data, {
      status: 200,
      headers: { 'content-type': MIME.get(path.extname(target)) || 'application/octet-stream', 'cache-control': 'no-cache' },
    });
  }

  return { serve };
}
