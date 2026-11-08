import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRedemptions, RedemptionError } from './redemptions.mjs';

const MAX_BODY_BYTES = 1024;
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "media-src 'self' data: blob:", "connect-src 'self'",
    "frame-ancestors 'none'", "base-uri 'none'", "object-src 'none'", "form-action 'self'",
  ].join('; '),
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function sendJson(res, status, data, headers = {}) {
  const json = JSON.stringify(data);
  res.writeHead(status, {
    ...securityHeaders,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    ...headers,
  });
  res.end(json);
}

function getIP(req, trustProxy) {
  const socket = req.socket.remoteAddress?.replace(/^::ffff:/, '') || 'unknown';
  if (!trustProxy || (socket !== '127.0.0.1' && socket !== '::1')) return socket;
  const proxy = req.headers['x-forwarded-for']?.split(',').at(-1).trim().replace(/^::ffff:/, '');
  return proxy && isIP(proxy) ? proxy : socket;
}

function playerToken(req) {
  return /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.headers.authorization ?? '')?.[1];
}

async function readCode(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
    throw new RedemptionError(415, 'invalid_request', 'Send the reward code as JSON.');
  }
  const tooLarge = () => new RedemptionError(413, 'request_too_large', 'The reward request is too large.');
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) throw tooLarge();
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw tooLarge();
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return value?.code;
  } catch {
    throw new RedemptionError(400, 'invalid_request', 'The reward request was unreadable.');
  }
}

async function api(store, req, res, pathname, trustProxy) {
  if (pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { ok: true });
  if (pathname === '/api/player' && req.method === 'POST') {
    return sendJson(res, 201, { token: store.createPlayer(getIP(req, trustProxy)) });
  }
  if (pathname === '/api/receipts' && req.method === 'GET') {
    return sendJson(res, 200, { receipts: store.listReceipts(playerToken(req)) });
  }
  if (pathname === '/api/redeem' && req.method === 'POST') {
    const token = playerToken(req);
    const result = store.redeem(token, getIP(req, trustProxy), await readCode(req));
    if (result.invalid) throw new RedemptionError(404, 'invalid_code', 'This code is invalid or has been retired.');
    if (result.exhausted) throw new RedemptionError(409, 'claim_limit', 'All rewards for this code have been claimed.');
    return sendJson(res, 200, result);
  }
  return sendJson(res, 404, { error: 'not_found', message: 'This endpoint does not exist.' });
}

function isInside(directory, path) {
  const child = relative(directory, path);
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

async function staticFile(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'method_not_allowed', message: 'This action is unavailable.' }, { Allow: 'GET, HEAD' });
  }

  const file = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  if (file.includes('\\') || file.includes('\0') || file.split('/').some((part) => part.startsWith('.'))) {
    return sendJson(res, 404, { error: 'not_found', message: 'File unavailable.' });
  }
  const type = types[extname(file)];
  if (!type) return sendJson(res, 404, { error: 'not_found', message: 'File unavailable.' });

  try {
    const directory = await realpath(DIST);
    const path = await realpath(resolve(directory, `.${file}`));
    if (!isInside(directory, path)) return sendJson(res, 404, { error: 'not_found', message: 'File unavailable.' });
    const info = await stat(path);
    if (!info.isFile()) return sendJson(res, 404, { error: 'not_found', message: 'File unavailable.' });

    const headers = { ...securityHeaders, 'Content-Type': type, 'Cache-Control': 'no-cache' };
    const tag = `W/"${info.size}-${Math.trunc(info.mtimeMs)}"`;
    headers.ETag = tag;
    if (req.headers['if-none-match'] === tag) {
      res.writeHead(304, headers).end();
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': info.size });
    if (req.method === 'HEAD') res.end();
    else createReadStream(path).on('error', () => res.destroy()).pipe(res);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    if (pathname === '/') {
      return sendJson(res, 503, { error: 'build_missing', message: 'The app build is unavailable. Run npm run build.' });
    }
    return sendJson(res, 404, { error: 'not_found', message: 'File unavailable.' });
  }
}

export function createGameServer(store, { trustProxy = false } = {}) {
  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname.startsWith('/api/')) await api(store, req, res, pathname, trustProxy);
      else await staticFile(req, res, pathname);
    } catch (error) {
      if (res.headersSent || res.destroyed) return res.destroy();
      if (error instanceof RedemptionError) {
        const headers = {};
        if (error.retryAfter) headers['Retry-After'] = String(error.retryAfter);
        if (!req.complete) headers.Connection = 'close';
        return sendJson(res, error.status, { error: error.error, message: error.message }, headers);
      }
      if (error instanceof URIError || error.code === 'ERR_INVALID_URL') {
        return sendJson(res, 400, { error: 'invalid_url', message: 'This URL is invalid.' });
      }
      console.error('Request failed:', error);
      sendJson(res, 500, { error: 'server_error', message: 'Rewards are temporarily unavailable.' });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT ?? 4173);
  const store = openRedemptions();
  const server = createGameServer(store, { trustProxy: process.env.GRILL_TRUST_PROXY === '1' });
  server.listen(port, host, () => {
    console.log(`Skewer Shift listening on http://${host}:${server.address().port}`);
  });
  const stop = () => server.close(() => store.close());
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
