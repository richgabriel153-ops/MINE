'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Store } = require('./store');
const { runWorkflow } = require('./engine');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PASSWORD = process.env.APP_PASSWORD || '';
const SECRET = process.env.APP_SECRET || crypto.createHash('sha256').update(`flowlite:${PASSWORD}`).digest('hex');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 1024 * 1024;
const SESSION_DAYS = 30;
const STEP_TYPES = ['http', 'set', 'code', 'if', 'wait'];

const store = new Store(DATA_DIR);
const running = new Set();

if (store.isNew) store.saveWorkflow(exampleWorkflow());

// ---------- helpers ----------

function newId() {
  return crypto.randomUUID();
}

function sessionToken() {
  return crypto.createHmac('sha256', SECRET).update('flowlite-session-v1').digest('hex');
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isAuthed(req) {
  if (!PASSWORD) return true;
  return safeEqual(parseCookies(req).session || '', sessionToken());
}

function isHttps(req) {
  return req.socket.encrypted || (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': typeof data === 'string' || Buffer.isBuffer(data) ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const text = await readBody(req);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

// Validates and normalises a workflow coming from the client.
function sanitizeWorkflow(input, existing) {
  if (!input || typeof input !== 'object') throw badRequest('Workflow must be an object');
  const name = String(input.name || '').trim() || 'Untitled workflow';
  const t = input.trigger || {};
  const type = ['manual', 'webhook', 'schedule'].includes(t.type) ? t.type : 'manual';
  const trigger = { type };
  if (type === 'webhook') {
    trigger.webhookId = (existing && existing.trigger && existing.trigger.webhookId) || crypto.randomBytes(12).toString('hex');
  }
  if (type === 'schedule') {
    trigger.mode = t.mode === 'daily' ? 'daily' : 'interval';
    trigger.intervalMinutes = Math.max(1, Math.round(Number(t.intervalMinutes) || 60));
    trigger.time = /^([01]\d|2[0-3]):[0-5]\d$/.test(t.time || '') ? t.time : '09:00';
  }
  if (!Array.isArray(input.steps)) throw badRequest('steps must be an array');
  const steps = input.steps.map((s) => {
    if (!STEP_TYPES.includes(s.type)) throw badRequest(`Unknown step type "${s.type}"`);
    const config = {};
    for (const [k, v] of Object.entries(s.config || {})) {
      if (['string', 'number', 'boolean'].includes(typeof v)) config[k] = v;
    }
    return { id: s.id || newId(), type: s.type, name: String(s.name || s.type).trim(), disabled: Boolean(s.disabled), config };
  });
  return {
    id: existing ? existing.id : newId(),
    name,
    active: Boolean(input.active),
    trigger,
    steps,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function execute(workflow, mode, input) {
  running.add(workflow.id);
  try {
    const execution = await runWorkflow(workflow, { mode, input });
    store.addExecution(execution);
    return execution;
  } finally {
    running.delete(workflow.id);
  }
}

function summary(e) {
  const { trigger, steps, output, ...rest } = e;
  return rest;
}

// ---------- static files ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, 'Not found');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// ---------- routes ----------

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  if (pathname === '/api/login' && method === 'POST') {
    const { password } = await readJson(req);
    if (PASSWORD && !safeEqual(password || '', PASSWORD)) {
      await new Promise((r) => setTimeout(r, 800)); // slow down guessing
      return send(res, 401, { error: 'Wrong password' });
    }
    const cookie = `session=${sessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${isHttps(req) ? '; Secure' : ''}`;
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie });
  }
  if (pathname === '/api/logout' && method === 'POST') {
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }
  if (pathname === '/api/me' && method === 'GET') {
    return send(res, 200, { authed: isAuthed(req), passwordRequired: Boolean(PASSWORD) });
  }

  if (!isAuthed(req)) return send(res, 401, { error: 'Not logged in' });

  // Only accept JSON for state-changing requests (blocks simple cross-site form posts).
  if (method !== 'GET' && !(req.headers['content-type'] || '').includes('application/json')) {
    return send(res, 415, { error: 'Content-Type must be application/json' });
  }

  if (pathname === '/api/workflows') {
    if (method === 'GET') {
      return send(res, 200, store.workflows.map((w) => ({ ...w, running: running.has(w.id) })));
    }
    if (method === 'POST') {
      return send(res, 201, store.saveWorkflow(sanitizeWorkflow(await readJson(req))));
    }
  }

  let m = pathname.match(/^\/api\/workflows\/([\w-]+)(\/run)?$/);
  if (m) {
    const wf = store.getWorkflow(m[1]);
    if (!wf) return send(res, 404, { error: 'Workflow not found' });
    if (m[2] && method === 'POST') {
      const body = await readJson(req);
      return send(res, 200, await execute(wf, 'manual', body.input || {}));
    }
    if (!m[2] && method === 'GET') return send(res, 200, wf);
    if (!m[2] && method === 'PUT') return send(res, 200, store.saveWorkflow(sanitizeWorkflow(await readJson(req), wf)));
    if (!m[2] && method === 'DELETE') {
      store.deleteWorkflow(wf.id);
      return send(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/executions') {
    const workflowId = url.searchParams.get('workflowId');
    if (method === 'GET') {
      const list = workflowId ? store.executions.filter((e) => e.workflowId === workflowId) : store.executions;
      return send(res, 200, list.map(summary));
    }
    if (method === 'DELETE') {
      store.clearExecutions(workflowId);
      return send(res, 200, { ok: true });
    }
  }

  m = pathname.match(/^\/api\/executions\/([\w-]+)$/);
  if (m && method === 'GET') {
    const e = store.getExecution(m[1]);
    return e ? send(res, 200, e) : send(res, 404, { error: 'Execution not found' });
  }

  return send(res, 404, { error: 'Not found' });
}

async function handleWebhook(req, res, url, hookId) {
  const wf = store.findByWebhook(hookId);
  if (!wf || !wf.active) return send(res, 404, { error: 'No active workflow for this webhook' });

  const raw = await readBody(req);
  let body = raw;
  if ((req.headers['content-type'] || '').includes('json')) {
    try { body = JSON.parse(raw); } catch { /* keep raw text */ }
  } else if ((req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) {
    body = Object.fromEntries(new URLSearchParams(raw));
  }
  const input = {
    method: req.method,
    query: Object.fromEntries(url.searchParams),
    headers: req.headers,
    body,
  };
  const execution = await execute(wf, 'webhook', input);
  if (execution.status === 'error') return send(res, 500, { error: execution.error, executionId: execution.id });
  return send(res, 200, execution.output ?? {});
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/healthz') return send(res, 200, 'ok');
    const hook = url.pathname.match(/^\/webhook\/([a-f0-9]+)\/?$/);
    if (hook) return await handleWebhook(req, res, url, hook[1]);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method === 'GET') return serveStatic(req, res, url.pathname);
    return send(res, 404, 'Not found');
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) send(res, status, { error: err.message || 'Server error' });
  }
});

// ---------- scheduler ----------

const lastRun = new Map();

function localDateKey(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function tick() {
  const now = new Date();
  for (const wf of store.workflows) {
    const t = wf.trigger || {};
    if (!wf.active || t.type !== 'schedule' || running.has(wf.id)) continue;

    if (t.mode === 'daily') {
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const key = `${wf.id}:daily`;
      if (hhmm !== t.time || lastRun.get(key) === localDateKey(now)) continue;
      lastRun.set(key, localDateKey(now));
    } else {
      const key = `${wf.id}:interval:${t.intervalMinutes}`;
      // First sighting starts the clock, so restarts don't trigger a burst of runs.
      if (!lastRun.has(key)) {
        lastRun.set(key, now.getTime());
        continue;
      }
      if (now.getTime() - lastRun.get(key) < t.intervalMinutes * 60_000) continue;
      lastRun.set(key, now.getTime());
    }

    execute(wf, 'schedule', { scheduledAt: now.toISOString() }).catch((err) => console.error('Scheduled run failed:', err));
  }
}

// ---------- example ----------

function exampleWorkflow() {
  return {
    id: newId(),
    name: 'Example: random joke',
    active: false,
    trigger: { type: 'manual' },
    steps: [
      {
        id: newId(),
        type: 'http',
        name: 'Get joke',
        disabled: false,
        config: { method: 'GET', url: 'https://official-joke-api.appspot.com/random_joke', headers: '', body: '' },
      },
      {
        id: newId(),
        type: 'set',
        name: 'Format',
        disabled: false,
        config: { json: '{\n  "joke": "{{ json.body.setup }} … {{ json.body.punchline }}"\n}' },
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ---------- start ----------

if (require.main === module) {
  if (!PASSWORD && process.env.NODE_ENV === 'production') {
    console.error('APP_PASSWORD must be set in production. Refusing to start an unprotected server.');
    process.exit(1);
  }
  setInterval(tick, 15_000).unref();
  server.listen(PORT, () => {
    console.log(`Flowlite running on http://localhost:${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
    if (!PASSWORD) console.warn('WARNING: APP_PASSWORD is not set — anyone who can reach this server can use it. Set it before deploying.');
  });
}

module.exports = { server, store, tick };
