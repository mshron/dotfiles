// Tests for the comments sidecar. Run: node --test .claude/skills/mark/assets/comments-server.test.mjs
// Each test spawns a fresh sidecar on a random loopback port with its own
// temp state directory, so tests never touch ~/.local/state/mark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('./comments-server.mjs', import.meta.url));
const VERSION = '1.6.0';

export function startServer(env = {}) {
  return new Promise((resolve, reject) => {
    const stateDir = env.MARK_STATE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'mark-test-'));
    const child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, VIV_COMMENTS_PORT: '0', MARK_STATE_DIR: stateDir, MARK_BIND: '127.0.0.1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/^listening (http:\/\/\S+)/m);
      if (m) {
        const token = fs.readFileSync(path.join(stateDir, 'token'), 'utf8').trim();
        resolve({ child, base: m[1], stateDir, token });
      }
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', (code) => reject(Object.assign(new Error(`sidecar exited ${code}: ${err}`), { code, stderr: err })));
  });
}

export function stop(s) {
  s.child.kill();
  fs.rmSync(s.stateDir, { recursive: true, force: true });
}

export function auth(s, extra = {}) {
  return { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', ...extra };
}

test('listens on 127.0.0.1 only and prints the address', async () => {
  const s = await startServer();
  try {
    assert.match(s.base, /^http:\/\/127\.0\.0\.1:\d+$/);
  } finally { stop(s); }
});

test('writes a 43-char base64url token with mode 0600 in a 0700 dir', async () => {
  const s = await startServer();
  try {
    assert.match(s.token, /^[A-Za-z0-9_-]{43}$/);
    const file = path.join(s.stateDir, 'token');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(s.stateDir).mode & 0o777, 0o700);
  } finally { stop(s); }
});

test('reuses an existing token file on restart', async () => {
  const s = await startServer();
  const first = s.token;
  s.child.kill();
  await new Promise((r) => s.child.on('exit', r));
  const s2 = await startServer({ MARK_STATE_DIR: s.stateDir });
  try {
    assert.equal(s2.token, first);
  } finally { stop(s2); }
});

test('GET /health needs no token and reports the version', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { version: VERSION });
  } finally { stop(s); }
});

test('POST /comment without a token gets 401 and writes nothing', async () => {
  const s = await startServer();
  const doc = path.join(s.stateDir, 'doc.md');
  fs.writeFileSync(doc, '# hi\n');
  try {
    const res = await fetch(`${s.base}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: doc, line: 1, quote: 'hi', comment: 'x' }),
    });
    assert.equal(res.status, 401);
    assert.equal(await res.text(), 'token required');
    assert.equal(fs.existsSync(`${doc}.comments.md`), false);
  } finally { stop(s); }
});

test('a wrong token of the right length gets 401', async () => {
  const s = await startServer();
  try {
    const bad = s.token.replace(/./g, (c) => (c === 'A' ? 'B' : 'A'));
    const res = await fetch(`${s.base}/comments?file=/tmp/x.md`, { headers: { Authorization: `Bearer ${bad}` } });
    assert.equal(res.status, 401);
  } finally { stop(s); }
});

test('refuses to start on a wildcard address', async () => {
  for (const bind of ['0.0.0.0', '::', '']) {
    await assert.rejects(startServer({ MARK_BIND: bind }), (e) => e.code === 1 && /refusing to listen/.test(e.stderr));
  }
});

test('a foreign Origin gets 403 even with the token', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.base}/comments?file=/tmp/x.md`, {
      headers: auth(s, { Origin: 'http://evil.example' }),
    });
    assert.equal(res.status, 403);
    assert.equal(await res.text(), 'origin not allowed');
  } finally { stop(s); }
});

test('preflight from the Vivify origin is allowed and echoes it', async () => {
  const s = await startServer({ VIV_PORT: '31622' });
  try {
    for (const origin of ['http://127.0.0.1:31622', 'http://localhost:31622']) {
      const res = await fetch(`${s.base}/comment`, { method: 'OPTIONS', headers: { Origin: origin } });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), origin);
      assert.match(res.headers.get('access-control-allow-headers'), /Authorization/);
    }
  } finally { stop(s); }
});

test('an origin with the wrong port gets 403', async () => {
  // Bind to the loopback alias so the test runs anywhere, and check the
  // allowed set is computed from the bind address, not hardcoded.
  const s = await startServer({ MARK_BIND: '127.0.0.1', VIV_PORT: '31622' });
  try {
    const res = await fetch(`${s.base}/health`, { headers: { Origin: 'http://127.0.0.1:9999' } });
    assert.equal(res.status, 403);
  } finally { stop(s); }
});

test('a 70 KiB body gets 413', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.base}/comment`, {
      method: 'POST',
      headers: auth(s),
      body: 'x'.repeat(70 * 1024),
    });
    assert.equal(res.status, 413);
    assert.equal(await res.text(), 'body too large');
  } finally { stop(s); }
});

function tmpDoc(s, name = 'doc.md') {
  const doc = path.join(s.stateDir, name);
  fs.writeFileSync(doc, '# hi\n\nsome text\n');
  return doc;
}

async function register(s, file) {
  return fetch(`${s.base}/register`, { method: 'POST', headers: auth(s), body: JSON.stringify({ file }) });
}

async function postComment(s, file, comment = 'looks good') {
  return fetch(`${s.base}/comment`, {
    method: 'POST',
    headers: auth(s),
    body: JSON.stringify({ file, line: 3, quote: 'some text', comment }),
  });
}

test('register then comment writes the block beside the document', async () => {
  const s = await startServer();
  const doc = tmpDoc(s);
  try {
    assert.equal((await register(s, doc)).status, 204);
    assert.equal((await postComment(s, doc)).status, 204);
    const written = fs.readFileSync(`${doc}.comments.md`, 'utf8');
    assert.match(written, /^## doc\.md:3 — "some text" \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\)\n\nlooks good\n\n$/);
  } finally { stop(s); }
});

test('comment on an unregistered path gets 403 and writes nothing', async () => {
  const s = await startServer();
  const doc = tmpDoc(s);
  try {
    const res = await postComment(s, doc);
    assert.equal(res.status, 403);
    assert.equal(await res.text(), 'file not registered');
    assert.equal(fs.existsSync(`${doc}.comments.md`), false);
  } finally { stop(s); }
});

test('register rejects missing files, directories, and relative paths', async () => {
  const s = await startServer();
  try {
    for (const file of [path.join(s.stateDir, 'nope.md'), s.stateDir, 'relative.md', 42]) {
      const res = await register(s, file);
      assert.equal(res.status, 400, `for ${String(file)}`);
    }
  } finally { stop(s); }
});

test('registering a symlink registers its real target', async () => {
  const s = await startServer();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-outside-'));
  const real = path.join(outside, 'real.md');
  fs.writeFileSync(real, 'real\n');
  const sibling = path.join(outside, 'sibling.md');
  fs.writeFileSync(sibling, 'sibling\n');
  const link = path.join(s.stateDir, 'link.md');
  fs.symlinkSync(real, link);
  try {
    assert.equal((await register(s, link)).status, 204);
    // Both spellings reach the same registered document...
    assert.equal((await postComment(s, link)).status, 204);
    assert.equal((await postComment(s, real)).status, 204);
    // ...and the comments file sits beside the real file, not the link.
    assert.equal(fs.existsSync(`${real}.comments.md`), true);
    assert.equal(fs.existsSync(`${link}.comments.md`), false);
    // A sibling in the same directory is still off limits.
    assert.equal((await postComment(s, sibling)).status, 403);
  } finally {
    stop(s);
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('mtimes and comments routes also require registration', async () => {
  const s = await startServer();
  const doc = tmpDoc(s);
  try {
    const q = `?file=${encodeURIComponent(doc)}`;
    assert.equal((await fetch(`${s.base}/mtimes${q}`, { headers: auth(s) })).status, 403);
    assert.equal((await fetch(`${s.base}/comments${q}`, { headers: auth(s) })).status, 403);
    assert.equal((await register(s, doc)).status, 204);
    const m = await (await fetch(`${s.base}/mtimes${q}`, { headers: auth(s) })).json();
    assert.equal(typeof m.doc, 'number');
    assert.equal(m.comments, null);
    assert.deepEqual(await (await fetch(`${s.base}/comments${q}`, { headers: auth(s) })).json(), []);
  } finally { stop(s); }
});

test('update and delete work through the allowlist and delete removes an empty file', async () => {
  const s = await startServer();
  const doc = tmpDoc(s);
  try {
    assert.equal((await register(s, doc)).status, 204);
    await postComment(s, doc, 'first');
    const [c] = await (await fetch(`${s.base}/comments?file=${encodeURIComponent(doc)}`, { headers: auth(s) })).json();
    const identity = { file: doc, line: c.line, quote: c.quote, timestamp: c.timestamp, oldComment: c.comment };
    let res = await fetch(`${s.base}/comment/update`, { method: 'POST', headers: auth(s), body: JSON.stringify({ ...identity, comment: 'second' }) });
    assert.equal(res.status, 204);
    assert.match(fs.readFileSync(`${doc}.comments.md`, 'utf8'), /\n\nsecond\n\n/);
    res = await fetch(`${s.base}/comment/delete`, { method: 'POST', headers: auth(s), body: JSON.stringify({ ...identity, oldComment: 'second' }) });
    assert.equal(res.status, 204);
    assert.equal(fs.existsSync(`${doc}.comments.md`), false);
  } finally { stop(s); }
});

test('register refuses a request with an Origin header, and does not register the file', async () => {
  const s = await startServer({ VIV_PORT: '31622' });
  const doc = tmpDoc(s);
  try {
    const res = await fetch(`${s.base}/register`, {
      method: 'POST',
      headers: auth(s, { Origin: 'http://127.0.0.1:31622' }),
      body: JSON.stringify({ file: doc }),
    });
    assert.equal(res.status, 403);
    assert.equal(await res.text(), 'register is for the mark command, not a browser');
    const comment = await fetch(`${s.base}/comment`, {
      method: 'POST',
      headers: auth(s),
      body: JSON.stringify({ file: doc, line: 3, quote: 'some text', comment: 'looks good' }),
    });
    assert.equal(comment.status, 403);
    assert.equal(await comment.text(), 'file not registered');
    assert.equal((await register(s, doc)).status, 204);
  } finally { stop(s); }
});
