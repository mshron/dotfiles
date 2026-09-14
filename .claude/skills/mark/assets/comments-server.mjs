#!/usr/bin/env node
// Sidecar for Vivify's injected comments.js: accepts click-to-comment POSTs
// and appends them to <file>.comments.md. Polls vivify-server's /health and
// exits when it's gone, so this process never outlives the preview server.
//
// Access rules (mark 1.6):
// - Listens on MARK_BIND only (default 127.0.0.1). Never on a wildcard.
// - Every request except GET /health and CORS preflight must carry
//   `Authorization: Bearer <token>`. The token lives in
//   $MARK_STATE_DIR/token (default ~/.local/state/mark/token, mode 0600)
//   and is created here on first start. `mark` reads it and puts it in the
//   URL fragment; comments.js sends it back as the header.
// - Only documents that `mark` registered through POST /register (in this
//   process's lifetime) can be read or written. The comments file is always
//   <registered real path>.comments.md.
// - The Origin header, when present, must be the Vivify page origin.
// - Bodies over 64 KiB get 413.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const VERSION = '1.6.0';
const PORT = Number(process.env.VIV_COMMENTS_PORT ?? 31623);
const VIV_PORT = process.env.VIV_PORT || 31622;
const BIND = process.env.MARK_BIND ?? '127.0.0.1';
const STATE_DIR = process.env.MARK_STATE_DIR || path.join(os.homedir(), '.local', 'state', 'mark');
const MAX_BODY = 64 * 1024;

if (BIND === '' || BIND === '0.0.0.0' || BIND === '::' || BIND === '[::]') {
  console.error(`comments-server: refusing to listen on '${BIND}' — MARK_BIND must be one address (127.0.0.1 or this host's Tailscale IP)`);
  process.exit(1);
}

// Read the per-host token, or create it. Regenerate only when the file is
// missing or unreadable, so restarts keep every open preview working.
function loadToken() {
  const file = path.join(STATE_DIR, 'token');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (/^[A-Za-z0-9_-]{43}$/.test(existing)) return existing;
  } catch {}
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(STATE_DIR, 0o700);
  const token = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return token;
}
const TOKEN_BUF = Buffer.from(loadToken());

function hasValidToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7).trim());
  return given.length === TOKEN_BUF.length && crypto.timingSafeEqual(given, TOKEN_BUF);
}

// Documents `mark` has opened in this process's lifetime, as real paths.
// Empty after a restart until `mark` runs again.
const REGISTERED = new Set();

// The real path of `file` if mark registered it, else null. Callers pick
// the document; this decides whether the sidecar may touch it.
function registeredPath(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return null;
  let real;
  try {
    real = fs.realpathSync(file);
  } catch {
    return null;
  }
  return REGISTERED.has(real) ? real : null;
}

// The page comes from Vivify on another port, so replies carry CORS headers
// for exactly that origin. People type `localhost`, which browsers treat as
// a different origin from 127.0.0.1, so loopback allows both spellings.
const ALLOWED_ORIGINS = new Set([`http://${BIND}:${VIV_PORT}`]);
if (BIND === '127.0.0.1') ALLOWED_ORIGINS.add(`http://localhost:${VIV_PORT}`);
const DEFAULT_ORIGIN = `http://${BIND}:${VIV_PORT}`;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

const TEXT = { 'Content-Type': 'text/plain' };
const JSON_TYPE = { 'Content-Type': 'application/json' };

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign(corsHeaders(res.req.headers.origin), headers));
  res.end(body);
}

// Collects the body up to MAX_BODY bytes. Past that it rejects with
// { status: 413 } and stops reading; the handler answers and closes.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.pause();
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const HEADING_RE = /^## .+?:(\d+) — "(.*?)"(?: \((.+)\))?( \[resolved\])?$/;

function parseComments(content) {
  const comments = [];
  let current = null;

  function flush() {
    if (current) {
      comments.push({
        line: current.line,
        quote: current.quote,
        comment: current.bodyLines.join('\n').trim(),
        timestamp: current.timestamp,
        resolved: current.resolved,
      });
    }
  }

  for (const line of content.split('\n')) {
    const match = line.match(HEADING_RE);
    if (match) {
      flush();
      current = { line: Number(match[1]), quote: match[2], timestamp: match[3] || null, resolved: Boolean(match[4]), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  flush();

  return comments;
}

// Heading line index and extent of every comment block, for in-place edits.
function findBlocks(lines) {
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING_RE);
    if (match) {
      blocks.push({ start: i, line: Number(match[1]), quote: match[2], timestamp: match[3] || null, resolved: Boolean(match[4]) });
    }
  }
  blocks.forEach((block, i) => {
    block.end = i + 1 < blocks.length ? blocks[i + 1].start : lines.length;
  });
  return blocks;
}

// Matches on the heading fields the client got from GET /comments; the old
// body disambiguates same-minute duplicates on one block.
function findTargetBlock(lines, { line, quote, timestamp, oldComment }) {
  return findBlocks(lines).find((b) =>
    !b.resolved && b.line === line && b.quote === quote && b.timestamp === (timestamp || null) &&
    (oldComment == null || lines.slice(b.start + 1, b.end).join('\n').trim() === oldComment));
}

const server = http.createServer({ requestTimeout: 10000, headersTimeout: 5000 }, async (req, res) => {
  try {
    const origin = req.headers.origin;
    if (origin !== undefined && !ALLOWED_ORIGINS.has(origin)) {
      send(res, 403, 'origin not allowed', TEXT);
      return;
    }

    if (req.method === 'OPTIONS') {
      send(res, 204, '');
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      send(res, 200, JSON.stringify({ version: VERSION }), JSON_TYPE);
      return;
    }

    if (!hasValidToken(req)) {
      send(res, 401, 'token required', TEXT);
      return;
    }

    if (req.method === 'POST' && req.url === '/register') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        send(res, 400, 'invalid JSON body', TEXT);
        return;
      }
      let real;
      try {
        if (typeof body.file !== 'string' || !path.isAbsolute(body.file)) throw new Error('not absolute');
        real = fs.realpathSync(body.file);
        if (!fs.statSync(real).isFile()) throw new Error('not a file');
      } catch {
        send(res, 400, 'file must be an absolute path to an existing regular file', TEXT);
        return;
      }
      REGISTERED.add(real);
      send(res, 204, '');
      return;
    }

    if (req.method === 'POST' && req.url === '/comment') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        send(res, 400, 'invalid JSON body', TEXT);
        return;
      }

      const { file, line, quote, comment } = body;
      const real = registeredPath(file);
      if (!real) {
        send(res, 403, 'file not registered', TEXT);
        return;
      }
      if (typeof comment !== 'string' || comment.trim() === '') {
        send(res, 400, 'comment must be a non-empty string', TEXT);
        return;
      }
      if (typeof line !== 'number') {
        send(res, 400, 'line must be a number', TEXT);
        return;
      }

      const stamp = new Date().toLocaleString('sv-SE').slice(0, 16);
      // A newline (or any run of whitespace) in the quote would split the
      // heading across lines and make the block unparseable.
      const cleanQuote = String(quote ?? '').replace(/\s+/g, ' ');
      const block = `## ${path.basename(real)}:${line} — "${cleanQuote}" (${stamp})\n\n${comment.trim()}\n\n`;
      fs.appendFileSync(`${real}.comments.md`, block);
      send(res, 204, '');
      return;
    }

    if (req.method === 'POST' && req.url === '/comment/update') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        send(res, 400, 'invalid JSON body', TEXT);
        return;
      }

      const { file, line, quote, timestamp, oldComment, comment } = body;
      const real = registeredPath(file);
      if (!real) {
        send(res, 403, 'file not registered', TEXT);
        return;
      }
      if (typeof comment !== 'string' || comment.trim() === '') {
        send(res, 400, 'comment must be a non-empty string', TEXT);
        return;
      }
      if (typeof line !== 'number') {
        send(res, 400, 'line must be a number', TEXT);
        return;
      }

      const commentsPath = `${real}.comments.md`;
      if (!fs.existsSync(commentsPath)) {
        send(res, 404, 'no comments file', TEXT);
        return;
      }

      const lines = fs.readFileSync(commentsPath, 'utf8').split('\n');
      const target = findTargetBlock(lines, { line, quote, timestamp, oldComment });
      if (!target) {
        send(res, 404, 'comment not found', TEXT);
        return;
      }

      const head = lines.slice(0, target.start + 1).join('\n');
      const tail = lines.slice(target.end).join('\n');
      fs.writeFileSync(commentsPath, `${head}\n\n${comment.trim()}\n\n${tail}`);
      send(res, 204, '');
      return;
    }

    if (req.method === 'POST' && req.url === '/comment/delete') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        send(res, 400, 'invalid JSON body', TEXT);
        return;
      }

      const { file, line, quote, timestamp, oldComment } = body;
      const real = registeredPath(file);
      if (!real) {
        send(res, 403, 'file not registered', TEXT);
        return;
      }
      if (typeof line !== 'number') {
        send(res, 400, 'line must be a number', TEXT);
        return;
      }

      const commentsPath = `${real}.comments.md`;
      if (!fs.existsSync(commentsPath)) {
        send(res, 404, 'no comments file', TEXT);
        return;
      }

      const lines = fs.readFileSync(commentsPath, 'utf8').split('\n');
      const target = findTargetBlock(lines, { line, quote, timestamp, oldComment });
      if (!target) {
        send(res, 404, 'comment not found', TEXT);
        return;
      }

      const remaining = lines.slice(0, target.start).concat(lines.slice(target.end));
      // Same rule as the agent workflow: no blocks left -> no file.
      if (findBlocks(remaining).length === 0) {
        fs.unlinkSync(commentsPath);
      } else {
        fs.writeFileSync(commentsPath, remaining.join('\n'));
      }
      send(res, 204, '');
      return;
    }

    // Staleness probe for comments.js: vivify's file watcher dies when a
    // file is saved via rename (atomic replace), so the client polls mtimes
    // and forces a reload when vivify misses a change.
    if (req.method === 'GET' && req.url.split('?')[0] === '/mtimes') {
      const file = new URL(req.url, 'http://localhost').searchParams.get('file');
      const real = registeredPath(file);
      if (!real) {
        send(res, 403, 'file not registered', TEXT);
        return;
      }
      const mtime = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : null);
      send(res, 200, JSON.stringify({ doc: mtime(real), comments: mtime(`${real}.comments.md`) }), JSON_TYPE);
      return;
    }

    if (req.method === 'GET' && req.url.split('?')[0] === '/comments') {
      const file = new URL(req.url, 'http://localhost').searchParams.get('file');
      const real = registeredPath(file);
      if (!real) {
        send(res, 403, 'file not registered', TEXT);
        return;
      }

      const commentsPath = `${real}.comments.md`;
      if (!fs.existsSync(commentsPath)) {
        send(res, 200, '[]', JSON_TYPE);
        return;
      }

      const comments = parseComments(fs.readFileSync(commentsPath, 'utf8'))
        .filter((c) => !c.resolved)
        .map(({ resolved, ...rest }) => rest);
      send(res, 200, JSON.stringify(comments), JSON_TYPE);
      return;
    }

    send(res, 404, 'not found', TEXT);
  } catch (err) {
    if (err && err.status === 413) {
      send(res, 413, 'body too large', Object.assign({ Connection: 'close' }, TEXT));
      res.once('finish', () => req.socket.destroy());
      return;
    }
    send(res, 500, 'internal error', TEXT);
  }
});

server.listen(PORT, BIND, () => {
  const { address, port } = server.address();
  console.log(`listening http://${address}:${port}`);
});

// Never outlive vivify-server: if its /health goes quiet, stop too.
setInterval(() => {
  globalThis
    .fetch(`http://localhost:${VIV_PORT}/health`, { signal: AbortSignal.timeout(1000) })
    .then((res) => {
      if (!res.ok) process.exit(0);
    })
    .catch(() => process.exit(0));
}, 60000);
