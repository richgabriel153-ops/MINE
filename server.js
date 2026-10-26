'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { Store } = require('./store');
const Engine = require('./public/engine');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PASSWORD = process.env.APP_PASSWORD || '';
const SECRET = process.env.APP_SECRET || crypto.createHash('sha256').update(`flowlite:${PASSWORD}`).digest('hex');
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || `flowlite-credentials:${SECRET}`).digest();
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 5 * 1024 * 1024;
const SESSION_DAYS = 30;
const TEST_WEBHOOK_TIMEOUT_MS = 120_000;
const MAX_WAIT_MS = 60 * 60_000;
const SECRET_PLACEHOLDER = '__flowlite_unchanged__';

const store = new Store(DATA_DIR);
const testWebhooks = new Map(); // "METHOD path" -> { workflow, nodeName, resolve }

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

function baseUrl(req) {
  if (process.env.WEBHOOK_URL) return process.env.WEBHOOK_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${isHttps(req) ? 'https' : 'http'}://${host}`;
}

function send(res, status, data, headers = {}) {
  const isText = typeof data === 'string' || Buffer.isBuffer(data);
  res.writeHead(status, {
    'Content-Type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isText ? data : JSON.stringify(data));
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
    throw httpError(400, 'Invalid JSON body');
  }
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// ---------- credentials (encrypted at rest with AES-256-GCM) ----------

function encrypt(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

function decrypt(text) {
  const buf = Buffer.from(text, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8'));
}

function credentialData(cred) {
  try {
    return decrypt(cred.data);
  } catch {
    throw new Engine.NodeError(`Credentials "${cred.name}" could not be decrypted`, 'The encryption key changed (APP_PASSWORD, APP_SECRET or ENCRYPTION_KEY). Re-enter the credential.');
  }
}

function credentialSummary(c) {
  return { id: c.id, name: c.name, type: c.type, createdAt: c.createdAt, updatedAt: c.updatedAt };
}

// Returns the credential with secret fields replaced by a placeholder, for the edit form.
function maskedCredential(c) {
  const def = Engine.CREDENTIAL_TYPES[c.type];
  const data = credentialData(c);
  for (const prop of (def && def.properties) || []) {
    if (prop.typeOptions && prop.typeOptions.password && data[prop.name]) data[prop.name] = SECRET_PLACEHOLDER;
  }
  return { ...credentialSummary(c), data };
}

function saveCredential(input, existing) {
  const type = existing ? existing.type : input.type;
  if (!Engine.CREDENTIAL_TYPES[type]) throw httpError(400, `Unknown credential type "${type}"`);
  const old = existing ? credentialData(existing) : {};
  const data = {};
  for (const prop of Engine.CREDENTIAL_TYPES[type].properties) {
    const v = input.data ? input.data[prop.name] : undefined;
    data[prop.name] = v === SECRET_PLACEHOLDER || v === undefined ? old[prop.name] ?? prop.default : String(v);
  }
  const now = new Date().toISOString();
  return store.saveCredential({
    id: existing ? existing.id : newId(),
    name: String(input.name || (existing && existing.name) || `${Engine.CREDENTIAL_TYPES[type].displayName} account`).trim(),
    type,
    data: encrypt(data),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  });
}

async function getCredentialForRun(ref, type) {
  const cred = (ref.id && store.getCredential(ref.id)) || store.credentials.find((c) => c.type === type && c.name === ref.name);
  return cred && cred.type === type ? credentialData(cred) : null;
}

// ---------- workflow validation ----------

function sanitizeWorkflow(input, existing) {
  if (!input || typeof input !== 'object') throw httpError(400, 'Workflow must be an object');
  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const names = new Set();
  for (const n of nodes) {
    if (!n || typeof n.name !== 'string' || !n.name || typeof n.type !== 'string') throw httpError(400, 'Every node needs a name and a type');
    if (names.has(n.name)) throw httpError(400, `There are two nodes called "${n.name}". Node names must be unique.`);
    names.add(n.name);
    if (!n.id) n.id = newId();
    if (!Array.isArray(n.position)) n.position = [0, 0];
    if (!n.parameters || typeof n.parameters !== 'object') n.parameters = {};
  }
  const connections = input.connections && typeof input.connections === 'object' ? input.connections : {};
  const now = new Date().toISOString();
  const workflow = {
    id: existing ? existing.id : newId(),
    name: String(input.name || '').trim() || 'My workflow',
    active: Boolean(input.active),
    nodes,
    connections,
    settings: input.settings && typeof input.settings === 'object' ? input.settings : {},
    pinData: input.pinData && typeof input.pinData === 'object' ? input.pinData : {},
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };
  if (workflow.active) checkActivation(workflow);
  return workflow;
}

function webhookNodes(workflow) {
  return workflow.nodes
    .filter((n) => n.type === 'n8n-nodes-base.webhook' && !n.disabled)
    .map((n) => {
      const p = Engine.resolveProperties(Engine.NODE_TYPES[n.type].properties, n.parameters);
      return { node: n, method: p.httpMethod || 'GET', path: String(p.path || '').replace(/^\/+|\/+$/g, ''), params: p };
    });
}

function checkActivation(workflow) {
  const triggers = workflow.nodes.filter((n) => !n.disabled && ['n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.webhook'].includes(n.type));
  if (!triggers.length) {
    throw httpError(400, 'Workflow could not be activated: it has no node to start the workflow. At least one trigger or webhook node (other than the manual trigger) is required.');
  }
  for (const hook of webhookNodes(workflow)) {
    if (!hook.path) throw httpError(400, `The Webhook node "${hook.node.name}" needs a path.`);
    const clash = store.workflows.find((w) => w.id !== workflow.id && w.active && webhookNodes(w).some((h) => h.path === hook.path && h.method === hook.method));
    if (clash) throw httpError(400, `The webhook path "${hook.method} ${hook.path}" is already used by the active workflow "${clash.name}".`);
  }
}

function workflowSummary(w) {
  return {
    id: w.id, name: w.name, active: w.active, createdAt: w.createdAt, updatedAt: w.updatedAt,
    nodeTypes: [...new Set(w.nodes.map((n) => n.type))],
  };
}

// ---------- running ----------

// Expressions and Code nodes run in node:vm with a timeout, so a runaway loop can't hang the server.
// node:vm is not a security boundary: workflows are written by the password holder only.
function vmEvaluate(code, ctx) {
  return vm.runInNewContext(`(${code}\n)`, { ...ctx }, { timeout: 1000 });
}

function vmRunCode(code, ctx, thisArg) {
  return vm.runInNewContext(`(async function () {\n${code}\n}).call(__this)`, { ...ctx, __this: thisArg }, { timeout: 30_000 });
}

async function execute(workflow, options) {
  const execution = await Engine.runWorkflow(workflow, {
    evaluate: vmEvaluate,
    runCode: vmRunCode,
    getCredential: getCredentialForRun,
    maxWaitMs: MAX_WAIT_MS,
    ...options,
  });
  store.addExecution(execution);
  return execution;
}

function executionSummary(e) {
  return {
    id: e.id, workflowId: e.workflowId, workflowName: e.workflowName, mode: e.mode, status: e.status,
    startedAt: e.startedAt, stoppedAt: e.stoppedAt, error: e.error, lastNodeExecuted: e.lastNodeExecuted,
  };
}

// ---------- webhooks ----------

function sendWebhookResponse(res, { status = 200, headers = {}, body }) {
  if (res.headersSent) return;
  const hasType = Object.keys(headers).some((h) => h.toLowerCase() === 'content-type');
  if (body === undefined || body === null || body === '') {
    res.writeHead(status, headers);
    res.end();
  } else if (typeof body === 'string') {
    res.writeHead(status, { ...(hasType ? {} : { 'Content-Type': 'text/plain; charset=utf-8' }), ...headers });
    res.end(body);
  } else {
    res.writeHead(status, { ...(hasType ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...headers });
    res.end(JSON.stringify(body));
  }
}

async function handleWebhook(req, res, url, isTest) {
  const hookPath = decodeURIComponent(url.pathname.replace(/^\/webhook(-test)?\//, '')).replace(/\/+$/, '');
  const method = req.method;
  let workflow;
  let nodeName;
  let onDone = () => {};

  if (isTest) {
    const key = `${method} ${hookPath}`;
    const waiter = testWebhooks.get(key);
    if (!waiter) {
      return send(res, 404, {
        code: 404,
        message: `The requested webhook "${method} ${hookPath}" is not registered.`,
        hint: "Click the 'Test workflow' button on the canvas, then try again. (In test mode, the webhook only works for one call after you click this button)",
      });
    }
    testWebhooks.delete(key);
    ({ workflow, nodeName } = waiter);
    onDone = waiter.resolve;
  } else {
    for (const w of store.workflows) {
      if (!w.active) continue;
      const hook = webhookNodes(w).find((h) => h.path === hookPath && h.method === method);
      if (hook) {
        workflow = w;
        nodeName = hook.node.name;
        break;
      }
    }
    if (!workflow) {
      return send(res, 404, { code: 404, message: `The requested webhook "${method} ${hookPath}" is not registered.`, hint: 'The workflow must be active for a production URL to run successfully.' });
    }
  }

  const raw = await readBody(req);
  const ctype = req.headers['content-type'] || '';
  let body = raw;
  if (ctype.includes('json')) {
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* keep raw text */ }
  } else if (ctype.includes('application/x-www-form-urlencoded')) {
    body = Object.fromEntries(new URLSearchParams(raw));
  } else if (!raw) body = {};

  const node = workflow.nodes.find((n) => n.name === nodeName);
  const params = Engine.resolveProperties(Engine.NODE_TYPES[node.type].properties, node.parameters);
  const item = {
    json: {
      headers: req.headers, params: {}, query: Object.fromEntries(url.searchParams), body,
      webhookUrl: `${baseUrl(req)}${url.pathname}`, executionMode: isTest ? 'test' : 'production',
    },
  };
  const responseCode = (params.options && params.options.responseCode) || 200;
  const run = (respond) => execute(workflow, { mode: isTest ? 'manual' : 'webhook', startNode: nodeName, triggerItems: [item], respond })
    .then((e) => { onDone(e); return e; });

  if (params.responseMode === 'onReceived') {
    sendWebhookResponse(res, { status: responseCode, body: { message: 'Workflow was started' } });
    run().catch((err) => console.error('Webhook execution failed:', err));
    return;
  }
  if (params.responseMode === 'responseNode') {
    const execution = await run((response) => sendWebhookResponse(res, response));
    if (!res.headersSent) {
      if (execution.status === 'error') sendWebhookResponse(res, { status: 500, body: { message: 'Error in workflow' } });
      else sendWebhookResponse(res, { status: 200, body: { message: 'Workflow executed successfully but no item was returned by the Respond to Webhook node' } });
    }
    return;
  }
  const execution = await run();
  if (execution.status === 'error') return sendWebhookResponse(res, { status: 500, body: { message: 'Error in workflow' } });
  const runs = execution.runData[execution.lastNodeExecuted] || [];
  const items = (runs.length && runs[runs.length - 1].data[0]) || [];
  let responseBody;
  if (params.responseData === 'allEntries') responseBody = items.map((i) => i.json);
  else if (params.responseData === 'noData') responseBody = '';
  else responseBody = items[0] ? items[0].json : {};
  sendWebhookResponse(res, { status: responseCode, body: responseBody });
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
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// ---------- API ----------

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
    return send(res, 200, { authed: isAuthed(req), passwordRequired: Boolean(PASSWORD), webhookBaseUrl: baseUrl(req) });
  }

  if (!isAuthed(req)) return send(res, 401, { error: 'Not logged in' });

  // Only accept JSON for state-changing requests (blocks simple cross-site form posts).
  if (method !== 'GET' && !(req.headers['content-type'] || '').includes('application/json')) {
    return send(res, 415, { error: 'Content-Type must be application/json' });
  }

  // Workflows
  if (pathname === '/api/workflows') {
    if (method === 'GET') return send(res, 200, store.workflows.map(workflowSummary));
    if (method === 'POST') return send(res, 201, store.saveWorkflow(sanitizeWorkflow(await readJson(req))));
  }
  if (pathname === '/api/workflows/run' && method === 'POST') {
    const body = await readJson(req);
    const workflow = sanitizeWorkflow({ ...body.workflowData, active: false }, body.workflowData && body.workflowData.id ? { id: body.workflowData.id } : null);
    const execution = await execute(workflow, {
      mode: 'manual', destinationNode: body.destinationNode || undefined, startNode: body.startNode || undefined, triggerItems: body.triggerItems,
    });
    return send(res, 200, execution);
  }
  if (pathname === '/api/workflows/listen' && method === 'POST') {
    const body = await readJson(req);
    const workflow = sanitizeWorkflow({ ...body.workflowData, active: false }, body.workflowData && body.workflowData.id ? { id: body.workflowData.id } : null);
    const hook = webhookNodes(workflow).find((h) => h.node.name === body.nodeName) || webhookNodes(workflow)[0];
    if (!hook) throw httpError(400, 'The workflow has no Webhook node to listen on');
    const key = `${hook.method} ${hook.path}`;
    const execution = await new Promise((resolve) => {
      const timer = setTimeout(() => { testWebhooks.delete(key); resolve(null); }, TEST_WEBHOOK_TIMEOUT_MS);
      testWebhooks.set(key, { workflow, nodeName: hook.node.name, resolve: (e) => { clearTimeout(timer); resolve(e); } });
      req.on('close', () => {
        if (!res.writableEnded && testWebhooks.get(key)) { clearTimeout(timer); testWebhooks.delete(key); }
      });
    });
    if (!execution) return send(res, 408, { error: 'No test event arrived within 2 minutes' });
    return send(res, 200, execution);
  }

  let m = pathname.match(/^\/api\/workflows\/([\w-]+)$/);
  if (m) {
    const wf = store.getWorkflow(m[1]);
    if (!wf) return send(res, 404, { error: 'Workflow not found' });
    if (method === 'GET') return send(res, 200, wf);
    if (method === 'PUT') return send(res, 200, store.saveWorkflow(sanitizeWorkflow(await readJson(req), wf)));
    if (method === 'DELETE') {
      store.deleteWorkflow(wf.id);
      return send(res, 200, { ok: true });
    }
  }

  // Executions
  if (pathname === '/api/executions') {
    const workflowId = url.searchParams.get('workflowId');
    const match = (e) => !workflowId || e.workflowId === workflowId;
    if (method === 'GET') return send(res, 200, store.executions.filter(match).map(executionSummary));
    if (method === 'DELETE') {
      store.deleteExecutions(match);
      return send(res, 200, { ok: true });
    }
  }
  m = pathname.match(/^\/api\/executions\/([\w-]+)$/);
  if (m) {
    const e = store.getExecution(m[1]);
    if (!e) return send(res, 404, { error: 'Execution not found' });
    if (method === 'GET') return send(res, 200, e);
    if (method === 'DELETE') {
      store.deleteExecutions((x) => x.id === e.id);
      return send(res, 200, { ok: true });
    }
  }

  // Credentials
  if (pathname === '/api/credentials') {
    if (method === 'GET') return send(res, 200, store.credentials.map(credentialSummary));
    if (method === 'POST') return send(res, 201, credentialSummary(saveCredential(await readJson(req))));
  }
  m = pathname.match(/^\/api\/credentials\/([\w-]+)$/);
  if (m) {
    const c = store.getCredential(m[1]);
    if (!c) return send(res, 404, { error: 'Credential not found' });
    if (method === 'GET') return send(res, 200, maskedCredential(c));
    if (method === 'PATCH') return send(res, 200, credentialSummary(saveCredential(await readJson(req), c)));
    if (method === 'DELETE') {
      store.deleteCredential(c.id);
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/healthz') return send(res, 200, 'ok');
    if (url.pathname.startsWith('/webhook-test/')) return await handleWebhook(req, res, url, true);
    if (url.pathname.startsWith('/webhook/')) return await handleWebhook(req, res, url, false);
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

function tick(now = new Date()) {
  for (const wf of store.workflows) {
    if (!wf.active) continue;
    for (const node of wf.nodes) {
      if (node.type !== 'n8n-nodes-base.scheduleTrigger' || node.disabled) continue;
      if (!Engine.isScheduleDue(node.parameters, now)) continue;
      execute(wf, { mode: 'trigger', startNode: node.name }).catch((err) => console.error('Scheduled run failed:', err));
    }
  }
}

function startScheduler() {
  // Align to the start of each minute, like cron.
  const delay = 60_000 - (Date.now() % 60_000) + 500;
  setTimeout(() => {
    tick();
    setInterval(() => tick(), 60_000).unref();
  }, delay).unref();
}

// ---------- example ----------

function exampleWorkflow() {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name: 'Example: Daily joke',
    active: false,
    nodes: [
      { id: newId(), name: 'When clicking ‘Test workflow’', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
      {
        id: newId(), name: 'HTTP Request', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [220, 0],
        parameters: { url: 'https://official-joke-api.appspot.com/random_ten', options: {} },
      },
      {
        id: newId(), name: 'If', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [440, 0],
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
            conditions: [{ id: newId(), leftValue: '={{ $json.type }}', rightValue: 'programming', operator: { type: 'string', operation: 'equals' } }],
            combinator: 'and',
          },
          options: {},
        },
      },
      {
        id: newId(), name: 'Edit Fields', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [660, -100],
        parameters: {
          assignments: { assignments: [{ id: newId(), name: 'joke', value: '={{ $json.setup }} … {{ $json.punchline }}', type: 'string' }] },
          options: {},
        },
      },
      { id: newId(), name: 'No Operation, do nothing', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [660, 100], parameters: {} },
    ],
    connections: {
      'When clicking ‘Test workflow’': { main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]] },
      'HTTP Request': { main: [[{ node: 'If', type: 'main', index: 0 }]] },
      If: { main: [[{ node: 'Edit Fields', type: 'main', index: 0 }], [{ node: 'No Operation, do nothing', type: 'main', index: 0 }]] },
    },
    settings: {},
    pinData: {},
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- start ----------

if (require.main === module) {
  if (!PASSWORD && process.env.NODE_ENV === 'production') {
    console.error('APP_PASSWORD must be set in production. Refusing to start an unprotected server.');
    process.exit(1);
  }
  startScheduler();
  server.listen(PORT, () => {
    console.log(`Flowlite running on http://localhost:${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
    if (!PASSWORD) console.warn('WARNING: APP_PASSWORD is not set — anyone who can reach this server can use it. Set it before deploying.');
  });
}

module.exports = { server, store, tick };
