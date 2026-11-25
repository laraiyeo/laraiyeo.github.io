#!/usr/bin/env node
'use strict';

/**
 * Local dev server for Live Sports Tracker.
 *
 * The site is deployed to Apache, where the root .htaccess rewrites clean URLs
 * (/mlb/aio -> mlb/aio.html). VS Code's Live Server is a plain static file
 * server with no rewrite support, so it answers "Cannot GET /mlb/aio" for every
 * extensionless URL. This server reproduces the .htaccess rules locally so the
 * URLs you test match production exactly.
 *
 *   node dev-server.js            # http://127.0.0.1:5500
 *   node dev-server.js --port 8080
 *   PORT=8080 node dev-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DEFAULT_PORT = 5500;
const MAX_PORT_ATTEMPTS = 10;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json',
};

// navbar.html / footer.html are fetched by JavaScript and injected into the
// page, so they must keep their ".html" address (same exception as .htaccess).
const PARTIAL = /(^|\/)(navbar|footer)\.html$/i;

// Folder roots land on that sport's main page instead of 403ing.
const FOLDER_ROOTS = new Map([
  ['/mlb', '/mlb/aio'],
  ['/nba', '/nba/aio'],
  ['/nfl', '/nfl/aio'],
  ['/nhl', '/nhl/aio'],
  ['/wnba', '/wnba/aio'],
  ['/f1', '/f1/standings'],
  ['/soccer', '/soccer/standings'],
  ['/ncaa', '/ncaa/ncaaf/scoreboard'],
  ['/ncaa/ncaaf', '/ncaa/ncaaf/scoreboard'],
]);

function statSafe(target) {
  try {
    return fs.statSync(target);
  } catch {
    return null;
  }
}

function isFile(target) {
  const stat = statSafe(target);
  return Boolean(stat && stat.isFile());
}

function isDir(target) {
  const stat = statSafe(target);
  return Boolean(stat && stat.isDirectory());
}

/** Map a URL path to a filesystem path, refusing anything outside ROOT. */
function toFsPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  // Check the raw path BEFORE normalizing: path.posix.normalize() collapses
  // "/../x" into "/x", which would silently turn a traversal attempt into a
  // valid in-root request. Dotfiles (.htaccess, .git) are refused too.
  const segments = decoded.split(/[\\/]+/);
  if (segments.some((segment) => segment === '..' || (segment.startsWith('.') && segment !== '.'))) {
    return null;
  }

  const normalized = path.posix.normalize(decoded);
  const resolved = path.resolve(ROOT, '.' + normalized);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  return resolved;
}

/**
 * Decide what a URL means. Returns one of:
 *   { redirect: '/target' }  -> 301
 *   { file: '/path.html' }   -> serve that file
 *   { notFound: true }       -> 404 page
 */
function resolve(pathname) {
  const clean = pathname.replace(/\/{2,}/g, '/');

  // /index.html and /index are the same content as /.
  if (clean === '/index.html' || clean === '/index') return { redirect: '/' };

  // The 404 page is served by the error handler, never linked.
  if (clean === '/404.html') return { file: '/404.html' };

  // JS-injected partials keep their extension.
  if (PARTIAL.test(clean)) {
    const fsPath = toFsPath(clean);
    return fsPath && isFile(fsPath) ? { file: clean } : { notFound: true };
  }

  // Any other .html request 301s to its clean URL.
  if (/\.html?$/i.test(clean)) {
    const fsPath = toFsPath(clean);
    if (fsPath && isFile(fsPath)) {
      return { redirect: clean.replace(/\.html?$/i, '') || '/' };
    }
    return { notFound: true };
  }

  // /music is both a page (music.html) and the folder holding its own assets.
  // The page wins at /music; /music/style.css still resolves inside the folder.
  if (clean === '/music/') return { redirect: '/music' };
  if (clean === '/music') return { file: '/music.html' };

  const noSlash = clean.length > 1 ? clean.replace(/\/+$/, '') : clean;

  if (FOLDER_ROOTS.has(noSlash)) return { redirect: FOLDER_ROOTS.get(noSlash) };

  if (clean === '/') return { file: '/index.html' };

  const fsPath = toFsPath(clean);
  if (!fsPath) return { notFound: true };

  // Real directory: serve its index.html, otherwise 404 (Options -Indexes).
  if (isDir(fsPath)) {
    const indexPath = path.join(fsPath, 'index.html');
    if (isFile(indexPath)) {
      return { file: '/' + path.relative(ROOT, indexPath).split(path.sep).join('/') };
    }
    return { notFound: true };
  }

  // Trailing slash on something that is not a directory: drop it.
  if (clean !== noSlash) return { redirect: noSlash };

  // Real file (css, js, images, ...).
  if (isFile(fsPath)) return { file: clean };

  // Extensionless URL -> matching .html file, address bar unchanged.
  if (isFile(fsPath + '.html')) return { file: clean + '.html' };

  return { notFound: true };
}

function log(method, from, status, to) {
  const suffix = to && to !== from ? ` -> ${to}` : '';
  console.log(`${method} ${from} ${status}${suffix}`);
}

function sendFile(req, res, urlPath, status, requestedPath) {
  const fsPath = toFsPath(urlPath);
  if (!fsPath || !isFile(fsPath)) {
    log(req.method, requestedPath, 404, null);
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end('Not Found');
    return;
  }

  const stat = fs.statSync(fsPath);
  const type = MIME[path.extname(fsPath).toLowerCase()] || 'application/octet-stream';

  log(req.method, requestedPath, status, urlPath);
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(fsPath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, {
      Allow: 'GET, HEAD',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end('Method Not Allowed');
    return;
  }

  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    pathname = '/';
  }

  const result = resolve(pathname);

  if (result.redirect) {
    log(method, pathname, 301, result.redirect);
    res.writeHead(301, { Location: result.redirect, 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  if (result.notFound) {
    sendFile(req, res, '/404.html', 404, pathname);
    return;
  }

  sendFile(req, res, result.file, 200, pathname);
});

function parsePort() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--port=')) {
      const value = Number(arg.slice('--port='.length));
      if (Number.isInteger(value) && value > 0) return value;
    }
    if (arg === '--port' && args[i + 1]) {
      const value = Number(args[i + 1]);
      if (Number.isInteger(value) && value > 0) return value;
    }
    // `npm run dev -- --port 8080` reaches us as a bare "8080" because npm
    // consumes the --port flag itself.
    if (/^\d+$/.test(arg)) {
      const value = Number(arg);
      if (value > 0) return value;
    }
  }
  const fromEnv = Number(process.env.PORT);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_PORT;
}

function listen(port, attemptsLeft) {
  const onError = (err) => {
    server.removeListener('listening', onListening);
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`Port ${port} is already in use (Live Server?). Trying ${port + 1}...`);
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\nPort ${port} is in use. Stop VS Code's Live Server (or pass --port <n>) and retry.\n`
      );
    } else {
      console.error(err.message);
    }
    process.exit(1);
  };

  const onListening = () => {
    server.removeListener('error', onError);
    const actual = server.address().port;
    console.log('\n  Live Sports Tracker dev server');
    console.log(`  http://127.0.0.1:${actual}/`);
    console.log('  Clean URLs enabled (same rules as .htaccess)\n');
  };

  server.once('error', onError);
  server.once('listening', onListening);
  server.listen(port, '127.0.0.1');
}

listen(parsePort(), MAX_PORT_ATTEMPTS);
