/**
 * Zero-dependency static development server for PayFlow.
 *
 *   npm start                -> serves the project folder on http://localhost:3000
 *   npm run preview          -> serves the built dist/ folder
 *   PORT=8080 npm start      -> custom port (Windows PowerShell: $env:PORT=8080; npm start)
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 3000;
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rootArg = process.argv[2] ?? '.';
const root = resolve(projectRoot, rootArg);
const port = Number(process.env.PORT) || DEFAULT_PORT;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = normalize(join(root, decoded));
  // Block path traversal outside the served folder.
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return null;
  }
  const info = await stat(candidate).catch(() => null);
  if (!info) {
    return null;
  }
  return info.isDirectory() ? join(candidate, 'index.html') : candidate;
}

const server = createServer(async (request, response) => {
  try {
    const filePath = await resolveFile(request.url ?? '/');
    const body = filePath ? await readFile(filePath).catch(() => null) : null;
    if (!body) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('404 Not Found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(body);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('400 Bad Request');
  }
});

server.listen(port, () => {
  console.log(`PayFlow demo running at http://localhost:${port}  (serving ${root})`);
  console.log('Press Ctrl+C to stop.');
});
