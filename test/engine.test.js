'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { runWorkflow, render } = require('../engine');

const wf = (steps) => ({ id: 'wf', name: 'Test', steps: steps.map((s, i) => ({ id: String(i), name: `s${i}`, ...s })) });

test('render keeps raw values for whole expressions and interpolates otherwise', () => {
  const ctx = { json: { n: 2, obj: { a: 1 } } };
  assert.equal(render('{{ json.n * 2 }}', ctx), 4);
  assert.deepEqual(render('{{ json.obj }}', ctx), { a: 1 });
  assert.equal(render('n={{ json.n }}, obj={{ json.obj }}', ctx), 'n=2, obj={"a":1}');
  assert.deepEqual(render({ list: ['{{ json.n }}', 'x'] }, ctx), { list: [2, 'x'] });
});

test('set, code and if steps pass data along', async () => {
  const exec = await runWorkflow(wf([
    { type: 'set', config: { json: '{"price": "{{ trigger.price }}", "label": "p={{ trigger.price }}"}' } },
    { type: 'code', config: { code: 'return { ...json, doubled: json.price * 2, first: steps.s0.label };' } },
    { type: 'if', config: { condition: 'json.doubled > 10' } },
  ]), { input: { price: 7 } });
  assert.equal(exec.status, 'success');
  assert.deepEqual(exec.output, { price: 7, label: 'p=7', doubled: 14, first: 'p=7' });
});

test('if step stops the workflow when false', async () => {
  const exec = await runWorkflow(wf([
    { type: 'if', config: { condition: 'json.ok' } },
    { type: 'set', config: { json: '{"reached": true}' } },
  ]), { input: { ok: false } });
  assert.equal(exec.status, 'stopped');
  assert.equal(exec.steps.length, 1);
});

test('errors are recorded and stop execution', async () => {
  const exec = await runWorkflow(wf([
    { type: 'code', config: { code: 'throw new Error("boom")' } },
    { type: 'set', config: { json: '{}' } },
  ]));
  assert.equal(exec.status, 'error');
  assert.match(exec.error, /boom/);
  assert.equal(exec.steps.length, 1);
});

test('disabled steps are skipped', async () => {
  const exec = await runWorkflow(wf([
    { type: 'set', disabled: true, config: { json: '{"a": 1}' } },
    { type: 'set', config: { json: '{"b": 2}' } },
  ]));
  assert.deepEqual(exec.output, { b: 2 });
  assert.equal(exec.steps.length, 1);
});

test('http step sends templated JSON and parses the response', async (t) => {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ method: req.method, type: req.headers['content-type'], got: JSON.parse(body) }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/`;

  const exec = await runWorkflow(wf([
    { type: 'http', config: { method: 'POST', url, body: '{"name": "{{ trigger.name }}"}' } },
  ]), { input: { name: 'Ada' } });
  assert.equal(exec.status, 'success');
  assert.deepEqual(exec.output.body, { method: 'POST', type: 'application/json', got: { name: 'Ada' } });
});
