import { createServer } from 'node:http';

// A real HTTP authorization fixture. Permissions come from the server session,
// independently of browser Bridge grants and plugin-supplied identity fields.
const sessions = new Map([['reader', new Set(['cluster.read'])]]);
const endpoints = new Map([
  ['/api/clusters/current', 'cluster.read'],
  ['/api/admin/clusters', 'cluster.admin'],
]);
createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/health') {
    response.end('{}');
    return;
  }
  const permission = endpoints.get(request.url);
  const sessionId = /(?:^|;\s*)fixture-session=([^;]+)/u.exec(request.headers.cookie ?? '')?.[1];
  const permissions = sessions.get(sessionId);
  if (!permission) {
    response.writeHead(404).end('{}');
    return;
  }
  if (!permissions) {
    response.writeHead(401).end(JSON.stringify({ code: 'BACKEND_UNAUTHENTICATED' }));
    return;
  }
  if (!permissions.has(permission)) {
    response.writeHead(403).end(JSON.stringify({ code: 'BACKEND_PERMISSION_DENIED' }));
    return;
  }
  response.end(JSON.stringify({ cluster: 'demo-cluster' }));
}).listen(3002, '127.0.0.1');
