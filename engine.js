'use strict';

// Runs a workflow: a trigger followed by a linear list of steps.
// Each step receives the previous step's output as `json`, plus every earlier
// step's output by name in `steps`, and the trigger payload in `trigger`.

const vm = require('node:vm');
const crypto = require('node:crypto');

const EXPR_TIMEOUT_MS = 1000;
const CODE_TIMEOUT_MS = 10_000;
const HTTP_TIMEOUT_MS = 30_000;
const MAX_WAIT_SECONDS = 300;
const MAX_STORED_OUTPUT = 20_000;

const TEMPLATE_RE = /\{\{([\s\S]+?)\}\}/g;
const WHOLE_TEMPLATE_RE = /^\s*\{\{([\s\S]+?)\}\}\s*$/;

// Note: node:vm is not a security sandbox. Expressions and code steps are
// written by the (password-protected) owner of the app, never by webhook callers.
function evaluate(expr, ctx) {
  return vm.runInNewContext(`(${expr})`, { ...ctx }, { timeout: EXPR_TIMEOUT_MS });
}

// Renders `{{ expression }}` placeholders. A string that is exactly one
// placeholder returns the raw value (object, number, ...); otherwise the
// results are interpolated as text. Objects and arrays are rendered deeply.
function render(value, ctx) {
  if (typeof value === 'string') {
    const whole = value.match(WHOLE_TEMPLATE_RE);
    if (whole && !whole[1].includes('{{')) return evaluate(whole[1], ctx);
    return value.replace(TEMPLATE_RE, (_, expr) => {
      const v = evaluate(expr, ctx);
      if (v === undefined || v === null) return '';
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => render(v, ctx));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = render(v, ctx);
    return out;
  }
  return value;
}

function parseJsonField(text, label) {
  if (text === undefined || text === null || String(text).trim() === '') return undefined;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label} is not valid JSON: ${err.message}`);
  }
}

function withTimeout(promise, ms, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const stepHandlers = {
  async http(config, ctx) {
    const method = (config.method || 'GET').toUpperCase();
    const url = render(config.url || '', ctx);
    if (!/^https?:\/\//i.test(url)) throw new Error(`URL must start with http:// or https:// (got "${url}")`);

    const headers = render(parseJsonField(config.headers, 'Headers') || {}, ctx);
    let body;
    if (!['GET', 'HEAD'].includes(method) && config.body && String(config.body).trim()) {
      body = render(String(config.body), ctx);
      if (typeof body !== 'string') body = JSON.stringify(body);
      const hasType = Object.keys(headers).some((h) => h.toLowerCase() === 'content-type');
      if (!hasType) {
        try {
          JSON.parse(body);
          headers['Content-Type'] = 'application/json';
        } catch {
          headers['Content-Type'] = 'text/plain';
        }
      }
    }

    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    const text = await res.text();
    let parsed = text;
    if ((res.headers.get('content-type') || '').includes('json')) {
      try { parsed = JSON.parse(text); } catch { /* keep text */ }
    }
    if (!res.ok && !config.continueOnError) {
      const snippet = typeof parsed === 'string' ? parsed.slice(0, 300) : JSON.stringify(parsed).slice(0, 300);
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${snippet}`);
    }
    return { status: res.status, headers: Object.fromEntries(res.headers), body: parsed };
  },

  async set(config, ctx) {
    const template = parseJsonField(config.json, 'Data');
    return template === undefined ? {} : render(template, ctx);
  },

  async code(config, ctx) {
    const source = `(async () => {\n${config.code || 'return json;'}\n})()`;
    const sandbox = { ...ctx, fetch, console, URL, URLSearchParams, setTimeout };
    const result = vm.runInNewContext(source, sandbox, { timeout: CODE_TIMEOUT_MS });
    return withTimeout(Promise.resolve(result), CODE_TIMEOUT_MS, 'Code step');
  },

  async if(config, ctx) {
    const passed = Boolean(evaluate(config.condition || 'true', ctx));
    return { __stop: !passed, value: ctx.json };
  },

  async wait(config, ctx) {
    const seconds = Math.min(Math.max(Number(config.seconds) || 0, 0), MAX_WAIT_SECONDS);
    await new Promise((r) => setTimeout(r, seconds * 1000));
    return ctx.json;
  },
};

// Converts a value into something JSON-safe for the execution log.
function snapshot(value) {
  if (value === undefined) return null;
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    return String(value);
  }
  if (text === undefined) return null;
  if (text.length > MAX_STORED_OUTPUT) return `${text.slice(0, MAX_STORED_OUTPUT)}… (truncated)`;
  return JSON.parse(text);
}

async function runWorkflow(workflow, { mode = 'manual', input = {} } = {}) {
  const execution = {
    id: crypto.randomUUID(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    mode,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    trigger: snapshot(input),
    steps: [],
    output: null,
    error: null,
  };

  const steps = {};
  let json = input;

  for (const step of workflow.steps || []) {
    if (step.disabled) continue;
    const handler = stepHandlers[step.type];
    const record = { id: step.id, name: step.name, type: step.type, status: 'success', output: null, error: null, ms: 0 };
    execution.steps.push(record);
    const started = Date.now();
    try {
      if (!handler) throw new Error(`Unknown step type "${step.type}"`);
      const ctx = { json, steps, trigger: input, now: new Date().toISOString() };
      let result = await handler(step.config || {}, ctx);
      record.ms = Date.now() - started;

      if (result && typeof result === 'object' && '__stop' in result) {
        record.output = snapshot({ passed: !result.__stop });
        if (result.__stop) {
          execution.status = 'stopped';
          break;
        }
        result = result.value;
      } else {
        record.output = snapshot(result);
      }
      json = result;
      if (step.name) steps[step.name] = result;
    } catch (err) {
      record.ms = Date.now() - started;
      record.status = 'error';
      record.error = err && err.message ? err.message : String(err);
      execution.status = 'error';
      execution.error = `${step.name || step.type}: ${record.error}`;
      break;
    }
  }

  if (execution.status === 'running') execution.status = 'success';
  execution.output = snapshot(json);
  execution.finishedAt = new Date().toISOString();
  return execution;
}

module.exports = { runWorkflow, render, stepHandlers };
