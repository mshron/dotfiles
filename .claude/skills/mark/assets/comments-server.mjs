#!/usr/bin/env node
// Sidecar for Vivify's injected comments.js: accepts click-to-comment POSTs
// and appends them to <file>.comments.md. Polls vivify-server's /health and
// exits when it's gone, so this process never outlives the preview server.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.VIV_COMMENTS_PORT || 31623;
const VIV_PORT = process.env.VIV_PORT || 31622;

// Vivify binds all interfaces and is viewed remotely, so replies must carry
// CORS headers rather than assume same-origin.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({}, CORS_HEADERS, headers));
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
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

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      send(res, 204, '');
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
      return;
    }

    if (req.method === 'POST' && req.url === '/comment') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        send(res, 400, 'invalid JSON body', { 'Content-Type': 'text/plain' });
        return;
      }

      const { file, line, quote, comment } = body;
      if (typeof file !== 'string' || !path.isAbsolute(file) || !fs.existsSync(file)) {
        send(res, 400, 'file must be an absolute path that exists', { 'Content-Type': 'text/plain' });
        return;
      }
      if (typeof comment !== 'string' || comment.trim() === '') {
        send(res, 400, 'comment must be a non-empty string', { 'Content-Type': 'text/plain' });
        return;
      }
      if (typeof line !== 'number') {
        send(res, 400, 'line must be a number', { 'Content-Type': 'text/plain' });
        return;
      }

      const stamp = new Date().toLocaleString('sv-SE').slice(0, 16);
      // A newline (or any run of whitespace) in the quote would split the
      // heading across lines and make the block unparseable.
      const cleanQuote = String(quote ?? '').replace(/\s+/g, ' ');
      const block = `## ${path.basename(file)}:${line} — "${cleanQuote}" (${stamp})\n\n${comment.trim()}\n\n`;
      fs.appendFileSync(`${file}.comments.md`, block);
      send(res, 204, '');
      return;
    }

    if (req.method === 'POST' && req.url === '/comment/update') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        send(res, 400, 'invalid JSON body', { 'Content-Type': 'text/plain' });
        return;
      }

      const { file, line, quote, timestamp, oldComment, comment } = body;
      if (typeof file !== 'string' || !path.isAbsolute(file)) {
        send(res, 400, 'file must be an absolute path', { 'Content-Type': 'text/plain' });
        return;
      }
      if (typeof comment !== 'string' || comment.trim() === '') {
        send(res, 400, 'comment must be a non-empty string', { 'Content-Type': 'text/plain' });
        return;
      }
      if (typeof line !== 'number') {
        send(res, 400, 'line must be a number', { 'Content-Type': 'text/plain' });
        return;
      }

      const commentsPath = `${file}.comments.md`;
      if (!fs.existsSync(commentsPath)) {
        send(res, 404, 'no comments file', { 'Content-Type': 'text/plain' });
        return;
      }

      const lines = fs.readFileSync(commentsPath, 'utf8').split('\n');
      const target = findTargetBlock(lines, { line, quote, timestamp, oldComment });
      if (!target) {
        send(res, 404, 'comment not found', { 'Content-Type': 'text/plain' });
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
        send(res, 400, 'invalid JSON body', { 'Content-Type': 'text/plain' });
        return;
      }

      const { file, line, quote, timestamp, oldComment } = body;
      if (typeof file !== 'string' || !path.isAbsolute(file)) {
        send(res, 400, 'file must be an absolute path', { 'Content-Type': 'text/plain' });
        return;
      }
      if (typeof line !== 'number') {
        send(res, 400, 'line must be a number', { 'Content-Type': 'text/plain' });
        return;
      }

      const commentsPath = `${file}.comments.md`;
      if (!fs.existsSync(commentsPath)) {
        send(res, 404, 'no comments file', { 'Content-Type': 'text/plain' });
        return;
      }

      const lines = fs.readFileSync(commentsPath, 'utf8').split('\n');
      const target = findTargetBlock(lines, { line, quote, timestamp, oldComment });
      if (!target) {
        send(res, 404, 'comment not found', { 'Content-Type': 'text/plain' });
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
      if (typeof file !== 'string' || !path.isAbsolute(file)) {
        send(res, 400, 'file must be an absolute path', { 'Content-Type': 'text/plain' });
        return;
      }
      const mtime = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : null);
      send(res, 200, JSON.stringify({ doc: mtime(file), comments: mtime(`${file}.comments.md`) }), {
        'Content-Type': 'application/json',
      });
      return;
    }

    if (req.method === 'GET' && req.url.split('?')[0] === '/comments') {
      const file = new URL(req.url, 'http://localhost').searchParams.get('file');
      if (typeof file !== 'string' || !path.isAbsolute(file)) {
        send(res, 400, 'file must be an absolute path', { 'Content-Type': 'text/plain' });
        return;
      }

      const commentsPath = `${file}.comments.md`;
      if (!fs.existsSync(commentsPath)) {
        send(res, 200, '[]', { 'Content-Type': 'application/json' });
        return;
      }

      const comments = parseComments(fs.readFileSync(commentsPath, 'utf8'))
        .filter((c) => !c.resolved)
        .map(({ resolved, ...rest }) => rest);
      send(res, 200, JSON.stringify(comments), { 'Content-Type': 'application/json' });
      return;
    }

    send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
  } catch {
    send(res, 500, 'internal error', { 'Content-Type': 'text/plain' });
  }
});

server.listen(PORT);

// Never outlive vivify-server: if its /health goes quiet, stop too.
setInterval(() => {
  globalThis
    .fetch(`http://localhost:${VIV_PORT}/health`, { signal: AbortSignal.timeout(1000) })
    .then((res) => {
      if (!res.ok) process.exit(0);
    })
    .catch(() => process.exit(0));
}, 60000);
