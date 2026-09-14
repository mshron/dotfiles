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
