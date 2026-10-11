'use strict';
// Serveur HTTP : API JSON sous /api + fichiers statiques de la PWA (dossier public/).
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('./db');
const { createApi, sendJson } = require('./api');
const { createPush } = require('./push');

const PORT = Number(process.env.PORT) || 3210;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'auphine.db');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
// Contact transmis aux services de notification (exigé par la norme VAPID).
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'https://github.com/BAZILA/auphine_process';

const store = createStore(DB_FILE);
const push = createPush(store, { subject: VAPID_SUBJECT });
const api = createApi(store, { uploadsDir: path.join(path.dirname(DB_FILE), 'uploads'), push });
api.purgeSessions();
setInterval(api.purgeSessions, 6 * 3600e3).unref();
api.startScheduler();
api.backfillBadges();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', CSP);
}

function sendFile(req, res, file, stat) {
  const lastModified = stat.mtime.toUTCString();
  const since = req.headers['if-modified-since'];
  if (since && Math.floor(stat.mtimeMs / 1000) <= Math.floor(Date.parse(since) / 1000)) {
    res.writeHead(304);
    return res.end();
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Last-Modified': lastModified,
    'Cache-Control': 'no-cache', // toujours revalider : les mises à jour arrivent tout de suite
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.stat(file, (err, stat) => {
    if (!err && stat.isFile()) return sendFile(req, res, file, stat);
    // Chemin sans extension → on laisse l'appli monopage gérer.
    if (!path.extname(rel)) {
      const index = path.join(PUBLIC_DIR, 'index.html');
      return fs.stat(index, (e, s) => (e ? res.writeHead(500).end() : sendFile(req, res, index, s)));
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Introuvable');
  });
}

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api.handle(req, res, url);
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Erreur interne du serveur' });
    else res.end();
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Le port ${PORT} est déjà utilisé. Lance avec un autre port, ex. : PORT=4000 npm start\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log('\n  Auphine est lancé\n');
  console.log(`  Sur cet ordinateur : http://localhost:${PORT}`);
  // Adresses du réseau local : pratique pour tester directement sur un téléphone en Wi-Fi.
  if (HOST === '0.0.0.0') {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const net of list || []) {
        if (net.family === 'IPv4' && !net.internal) console.log(`  Sur ton téléphone  : http://${net.address}:${PORT}`);
      }
    }
  }
  console.log(`\n  Base de données : ${DB_FILE}\n`);
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
