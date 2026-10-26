'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-'));
process.env.APP_PASSWORD = 'secret';
const { server } = require('../server');

let base;
test.before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const json = (body, cookie) => ({
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify(body),
});

test('API requires login and webhooks run active workflows', async () => {
  assert.equal((await fetch(`${base}/api/workflows`)).status, 401);
  assert.equal((await fetch(`${base}/api/login`, { method: 'POST', ...json({ password: 'nope' }) })).status, 401);

  const login = await fetch(`${base}/api/login`, { method: 'POST', ...json({ password: 'secret' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const list = await (await fetch(`${base}/api/workflows`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.length, 1, 'example workflow is seeded');

  const created = await (await fetch(`${base}/api/workflows`, {
    method: 'POST',
    ...json({
      name: 'Echo',
      active: true,
      trigger: { type: 'webhook' },
      steps: [{ type: 'set', name: 'Reply', config: { json: '{"hello": "{{ trigger.body.name }}", "q": "{{ trigger.query.x }}"}' } }],
    }, cookie),
  })).json();
  assert.match(created.trigger.webhookId, /^[a-f0-9]+$/);

  const hook = await fetch(`${base}/webhook/${created.trigger.webhookId}?x=1`, { method: 'POST', ...json({ name: 'Ada' }) });
  assert.equal(hook.status, 200);
  assert.deepEqual(await hook.json(), { hello: 'Ada', q: '1' });

  const runs = await (await fetch(`${base}/api/executions?workflowId=${created.id}`, { headers: { Cookie: cookie } })).json();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'success');

  // Deactivated workflows don't respond to webhooks.
  await fetch(`${base}/api/workflows/${created.id}`, { method: 'PUT', ...json({ ...created, active: false }, cookie) });
  assert.equal((await fetch(`${base}/webhook/${created.trigger.webhookId}`)).status, 404);
});

test('static files are served without path traversal', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/..%2fserver.js`)).status, 404);
});
