'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-'));
process.env.APP_PASSWORD = 'secret';
const { server, store } = require('../server');

let base;
let cookie;
test.before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const api = async (method, p, body) => {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const webhookWorkflow = (pathName, responseMode) => ({
  name: `Hook ${pathName}`,
  active: true,
  nodes: [
    { name: 'Webhook', type: 'n8n-nodes-base.webhook', position: [0, 0], parameters: { httpMethod: 'POST', path: pathName, responseMode } },
    { name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', position: [200, 0], parameters: { respondWith: 'json', responseBody: '={ "hello": "{{ $json.body.name }}", "q": "{{ $json.query.x }}" }' } },
  ],
  connections: { Webhook: { main: [[{ node: 'Respond', type: 'main', index: 0 }]] } },
});

test('login is required, and the example workflow is seeded', async () => {
  assert.equal((await api('GET', '/api/workflows')).status, 401);
  assert.equal((await api('POST', '/api/login', { password: 'nope' })).status, 401);
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'secret' }) });
  cookie = res.headers.get('set-cookie').split(';')[0];
  const list = await api('GET', '/api/workflows');
  assert.equal(list.body.length, 1);
});

test('production webhook runs the active workflow and answers via Respond to Webhook', async () => {
  const created = await api('POST', '/api/workflows', webhookWorkflow('contact', 'responseNode'));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const hook = await fetch(`${base}/webhook/contact?x=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ada' }) });
  assert.equal(hook.status, 200);
  assert.deepEqual(await hook.json(), { hello: 'Ada', q: '1' });

  const runs = await api('GET', `/api/executions?workflowId=${created.body.id}`);
  assert.equal(runs.body[0].status, 'success');
  assert.equal(runs.body[0].mode, 'webhook');

  // Another active workflow can't take the same path, and inactive workflows don't answer.
  assert.equal((await api('POST', '/api/workflows', webhookWorkflow('contact', 'onReceived'))).status, 400);
  await api('PUT', `/api/workflows/${created.body.id}`, { ...created.body, active: false });
  assert.equal((await fetch(`${base}/webhook/contact`, { method: 'POST' })).status, 404);
});

test('test webhook delivers one call to a listening editor', async () => {
  const wf = webhookWorkflow('try-me', 'responseNode');
  wf.active = false;
  const listening = api('POST', '/api/workflows/listen', { workflowData: wf, nodeName: 'Webhook' });
  await new Promise((r) => setTimeout(r, 100));
  const hook = await fetch(`${base}/webhook-test/try-me`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Grace' }) });
  assert.deepEqual(await hook.json(), { hello: 'Grace', q: '' });
  const { body: execution } = await listening;
  assert.equal(execution.status, 'success');
  assert.deepEqual(execution.runData.Respond[0].data[0][0].json.body, { name: 'Grace' });
  assert.equal((await fetch(`${base}/webhook-test/try-me`, { method: 'POST' })).status, 404, 'only one call per listen');
});

test('activation needs a trigger', async () => {
  const res = await api('POST', '/api/workflows', { name: 'x', active: true, nodes: [{ name: 'Start', type: 'n8n-nodes-base.manualTrigger', parameters: {} }], connections: {} });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /no node to start the workflow/);
});

test('credentials are encrypted at rest, masked in the API and used by runs', async () => {
  const created = await api('POST', '/api/credentials', { name: 'My key', type: 'httpHeaderAuth', data: { name: 'x-api-key', value: 'top-secret' } });
  assert.equal(created.status, 201);
  assert.ok(!fs.readFileSync(path.join(process.env.DATA_DIR, 'credentials.json'), 'utf8').includes('top-secret'));
  const read = await api('GET', `/api/credentials/${created.body.id}`);
  assert.equal(read.body.data.name, 'x-api-key');
  assert.equal(read.body.data.value, '__flowlite_unchanged__');
  // Renaming keeps the secret.
  await api('PATCH', `/api/credentials/${created.body.id}`, { name: 'Renamed', data: read.body.data });
  const wf = {
    name: 'cred test',
    nodes: [
      { name: 'Start', type: 'n8n-nodes-base.manualTrigger', parameters: {} },
      { name: 'Code', type: 'n8n-nodes-base.code', parameters: { jsCode: 'return [{ ok: true }]' } },
    ],
    connections: { Start: { main: [[{ node: 'Code', type: 'main', index: 0 }]] } },
  };
  const run = await api('POST', '/api/workflows/run', { workflowData: wf });
  assert.equal(run.body.status, 'success');
  const cred = store.getCredential(created.body.id);
  assert.equal(cred.name, 'Renamed');
});

test('code nodes time out instead of hanging the server', async () => {
  const wf = {
    name: 'loop',
    nodes: [
      { name: 'Start', type: 'n8n-nodes-base.manualTrigger', parameters: {} },
      { name: 'Expr', type: 'n8n-nodes-base.set', parameters: { assignments: { assignments: [{ name: 'x', value: '={{ (() => { while (true) {} })() }}', type: 'string' }] } } },
    ],
    connections: { Start: { main: [[{ node: 'Expr', type: 'main', index: 0 }]] } },
  };
  const run = await api('POST', '/api/workflows/run', { workflowData: wf });
  assert.equal(run.body.status, 'error');
  assert.match(run.body.error.message, /timed out/i);
});

test('static files are served without path traversal', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/engine.js`)).status, 200);
  assert.equal((await fetch(`${base}/..%2fserver.js`)).status, 404);
});
