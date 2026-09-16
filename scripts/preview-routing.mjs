// Local production-build validation only. This is not a production deployment server.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const hostRoot = resolve('apps/console/dist-validation');
const pluginRoot = resolve('apps/example-restricted-plugin/dist');
const uiFixtureRoot = resolve('apps/ui-composition-fixtures/dist');
const contentTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json',
};
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const upstream = await fetch(`http://127.0.0.1:3002${url.pathname}${url.search}`, {
        headers: { cookie: request.headers.cookie ?? '' },
        redirect: 'manual',
      });
      response.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      });
      response.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    const plugin = /^\/plugins\/kubeeye\/(?:1|2)\.0\.0\/(.*)$/.exec(url.pathname);
    const uiFixture = /^\/plugins\/ui-(?:[abc]|action)\/1\.0\.0\//.test(url.pathname);
    const root = plugin ? pluginRoot : uiFixture ? uiFixtureRoot : hostRoot;
    const resource = plugin
      ? plugin[1] || 'index.html'
      : decodeURIComponent(url.pathname).replace(/^\//, '') +
          (uiFixture && url.pathname.endsWith('/') ? 'index.html' : '') || 'index.html';
    let file = resolve(root, resource);
    if (!file.startsWith(root + '/')) {
      response.writeHead(400);
      response.end();
      return;
    }
    let exists = await stat(file).then(
      (s) => s.isFile(),
      () => false,
    );
    const reserved =
      /^\/(?:api|plugins|static|assets)(?:\/|$)/.test(url.pathname) ||
      /\.(?:js|css|map|png|ico|svg|json)$/.test(url.pathname);
    if (!exists && !reserved && request.headers.accept?.includes('text/html')) {
      file = resolve(root, 'index.html');
      exists = true;
    }
    if (!exists) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': contentTypes[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=0',
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(500, { 'content-type': 'text/plain' });
    response.end('Preview request failed');
  }
}).listen(Number(process.env.PREVIEW_PORT ?? 3200), '127.0.0.1', () =>
  console.log('Routing validation preview ready'),
);
