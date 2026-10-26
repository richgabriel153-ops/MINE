'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const E = require('../public/engine');

const node = (name, type, parameters = {}, x = 0) => ({ id: name, name, type: `n8n-nodes-base.${type}`, typeVersion: 1, position: [x, 0], parameters });
const link = (...pairs) => {
  const c = {};
  for (const [from, to, out = 0, index = 0] of pairs) {
    c[from] = c[from] || { main: [] };
    while (c[from].main.length <= out) c[from].main.push([]);
    c[from].main[out].push({ node: to, type: 'main', index });
  }
  return c;
};
const out = (ex, name, o = 0) => ex.runData[name][0].data[o].map((i) => i.json);

test('expressions: whole-value, interpolation, $() references and $now', async () => {
  const wf = {
    nodes: [
      node('Start', 'manualTrigger'),
      node('Code', 'code', { jsCode: 'return [{a: 2, tags: ["x","y"]}, {a: 5, tags: []}]' }, 200),
      node('Set', 'set', { assignments: { assignments: [
        { name: 'double', value: '={{ $json.a * 2 }}', type: 'number' },
        { name: 'text', value: "=a={{ $json.a }} first={{ $('Code').first().json.a }} year={{ $now.toFormat('yyyy') }}", type: 'string' },
        { name: 'nested.ok', value: '={{ $json.tags.length > 0 }}', type: 'boolean' },
      ] } }, 400),
    ],
    connections: link(['Start', 'Code'], ['Code', 'Set']),
  };
  const ex = await E.runWorkflow(wf);
  assert.equal(ex.status, 'success');
  assert.deepEqual(out(ex, 'Set'), [
    { double: 4, text: `a=2 first=2 year=${new Date().getFullYear()}`, nested: { ok: true } },
    { double: 10, text: `a=5 first=2 year=${new Date().getFullYear()}`, nested: { ok: false } },
  ]);
});

test('If routes items to true/false outputs and Merge waits for both inputs', async () => {
  const cond = (op, right) => ({ conditions: [{ leftValue: '={{ $json.n }}', rightValue: right, operator: { type: 'number', operation: op } }], combinator: 'and' });
  const wf = {
    nodes: [
      node('Start', 'manualTrigger'),
      node('Code', 'code', { jsCode: 'return [1, 5, 9].map(n => ({ n }))' }),
      node('If', 'if', { conditions: cond('gt', 4) }),
      node('Big', 'noOp'),
      node('Small', 'noOp'),
      node('Merge', 'merge', {}),
    ],
    connections: link(['Start', 'Code'], ['Code', 'If'], ['If', 'Big', 0], ['If', 'Small', 1], ['Big', 'Merge', 0, 0], ['Small', 'Merge', 0, 1]),
  };
  const ex = await E.runWorkflow(wf);
  assert.deepEqual(out(ex, 'If', 0), [{ n: 5 }, { n: 9 }]);
  assert.deepEqual(out(ex, 'If', 1), [{ n: 1 }]);
  assert.deepEqual(out(ex, 'Merge'), [{ n: 5 }, { n: 9 }, { n: 1 }]);
  assert.equal(ex.runData.Merge.length, 1, 'merge runs once');
});

test('legacy IF v1 conditions and Set v2 values from imported workflows', async () => {
  const wf = {
    nodes: [
      node('Start', 'manualTrigger'),
      node('Set', 'set', { values: { string: [{ name: 'name', value: 'Ada' }], number: [{ name: 'age', value: 36 }] } }),
      node('If', 'if', { conditions: { number: [{ value1: '={{ $json.age }}', operation: 'larger', value2: 30 }] } }),
    ],
    connections: link(['Start', 'Set'], ['Set', 'If']),
  };
  const ex = await E.runWorkflow(wf);
  assert.deepEqual(out(ex, 'If', 0), [{ name: 'Ada', age: 36 }]);
});

test('errors stop the run, or continue when the node is set to', async () => {
  const wf = {
    nodes: [node('Start', 'manualTrigger'), node('Boom', 'code', { jsCode: 'throw new Error("boom")' }), node('After', 'noOp')],
    connections: link(['Start', 'Boom'], ['Boom', 'After']),
  };
  let ex = await E.runWorkflow(wf);
  assert.equal(ex.status, 'error');
  assert.equal(ex.error.node, 'Boom');
  assert.match(ex.error.message, /boom/);
  assert.equal(ex.runData.After, undefined);

  wf.nodes[1].onError = 'continueRegularOutput';
  ex = await E.runWorkflow(wf);
  assert.equal(ex.status, 'success');
  assert.deepEqual(out(ex, 'After'), [{ error: 'boom' }]);
});

test('partial execution runs only up to the destination node', async () => {
  const wf = {
    nodes: [node('Start', 'manualTrigger'), node('A', 'noOp'), node('B', 'noOp')],
    connections: link(['Start', 'A'], ['A', 'B']),
  };
  const ex = await E.runWorkflow(wf, { destinationNode: 'A' });
  assert.deepEqual(Object.keys(ex.runData), ['Start', 'A']);
});

test('data nodes: split out, aggregate, sort, limit, dedupe, date, crypto', async () => {
  const wf = {
    nodes: [
      node('Start', 'manualTrigger'),
      node('Code', 'code', { jsCode: 'return [{ list: [{v: 3}, {v: 1}, {v: 2}, {v: 1}] }]' }),
      node('Split', 'splitOut', { fieldToSplitOut: 'list' }),
      node('Dedupe', 'removeDuplicates', {}),
      node('Sort', 'sort', { sortFieldsUi: { sortField: [{ fieldName: 'v', order: 'descending' }] } }),
      node('Limit', 'limit', { maxItems: 2 }),
      node('Agg', 'aggregate', { fieldsToAggregate: { fieldToAggregate: [{ fieldToAggregate: 'v' }] } }),
      node('Date', 'dateTime', { operation: 'addToDate', magnitude: '2024-01-31', duration: 1, timeUnit: 'months' }),
      node('Hash', 'crypto', { value: 'hello', dataPropertyName: 'md5' }),
    ],
    connections: link(['Start', 'Code'], ['Code', 'Split'], ['Split', 'Dedupe'], ['Dedupe', 'Sort'], ['Sort', 'Limit'], ['Limit', 'Agg'], ['Agg', 'Date'], ['Date', 'Hash']),
  };
  const ex = await E.runWorkflow(wf);
  assert.equal(ex.status, 'success', ex.error && ex.error.message);
  assert.deepEqual(out(ex, 'Dedupe'), [{ v: 3 }, { v: 1 }, { v: 2 }]);
  assert.deepEqual(out(ex, 'Agg'), [{ v: [3, 2] }]);
  const final = out(ex, 'Hash')[0];
  assert.match(final.newDate, /^2024-02-29T/);
  assert.equal(final.md5, '5d41402abc4b2a76b9719d911017c592');
});

test('HTTP Request sends JSON body with query and header auth, and splits array responses', async (t) => {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([{ url: req.url, key: req.headers['x-api-key'], got: JSON.parse(body || '{}') }, { second: true }]));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const wf = {
    nodes: [
      node('Start', 'manualTrigger'),
      { ...node('HTTP', 'httpRequest', {
        method: 'POST', url: `=http://127.0.0.1:${server.address().port}/items`,
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendQuery: true, queryParameters: { parameters: [{ name: 'page', value: '2' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={ "name": "{{ "Ada" }}" }',
      }), credentials: { httpHeaderAuth: { id: 'c1', name: 'key' } } },
    ],
    connections: link(['Start', 'HTTP']),
  };
  const ex = await E.runWorkflow(wf, { getCredential: async () => ({ name: 'x-api-key', value: 'secret' }) });
  assert.equal(ex.status, 'success', ex.error && ex.error.message);
  assert.deepEqual(out(ex, 'HTTP'), [{ url: '/items?page=2', key: 'secret', got: { name: 'Ada' } }, { second: true }]);
});

test('schedule rules and cron expressions', () => {
  const at = (s) => new Date(s);
  assert.ok(E.isScheduleDue({ rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } }, at('2026-10-26T09:30:00')));
  assert.ok(!E.isScheduleDue({ rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } }, at('2026-10-26T09:31:00')));
  assert.ok(E.isScheduleDue({ rule: { interval: [{ field: 'days', triggerAtHour: 9 }] } }, at('2026-10-26T09:00:00')));
  assert.ok(E.isScheduleDue({}, at('2026-10-26T00:00:00')), 'default is daily at midnight');
  assert.ok(E.isScheduleDue({ rule: { interval: [{ field: 'weeks', triggerAtDay: [1], triggerAtHour: 8 }] } }, at('2026-10-26T08:00:00')));
  assert.ok(E.cronMatches('*/15 9-17 * * mon-fri', at('2026-10-26T09:45:00')));
  assert.ok(!E.cronMatches('0 9 * * 6,0', at('2026-10-26T09:00:00')));
});
