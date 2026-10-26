'use strict';

// ---------- tiny DOM helper ----------

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

// Appends children, flattening nested arrays and skipping empty values.
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

function mount(...children) {
  $view.replaceChildren();
  append($view, children);
}

const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $back = document.getElementById('back');
const $actions = document.getElementById('top-actions');
const $tabbar = document.getElementById('tabbar');
const $toast = document.getElementById('toast');

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, 2500);
}

function setChrome({ title, back, actions = [], tab }) {
  $title.textContent = title;
  $back.hidden = !back;
  $back.onclick = back ? () => { location.hash = back; } : null;
  $actions.replaceChildren(...actions);
  $tabbar.hidden = !tab;
  for (const a of $tabbar.querySelectorAll('a')) a.classList.toggle('active', a.dataset.tab === tab);
}

// ---------- API ----------

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') {
    renderLogin();
    throw new Error('Not logged in');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- definitions ----------

const TRIGGERS = {
  manual: 'Manual (Run button)',
  webhook: 'Webhook (URL)',
  schedule: 'Schedule',
};

const STEP_TYPES = {
  http: {
    label: 'HTTP Request',
    desc: 'Call any API or website',
    defaults: { method: 'GET', url: '', headers: '', body: '', continueOnError: false },
    fields: [
      { key: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/items/{{ json.id }}' },
      { key: 'headers', label: 'Headers (JSON)', type: 'code', placeholder: '{ "Authorization": "Bearer …" }' },
      { key: 'body', label: 'Body', type: 'code', placeholder: '{ "message": "{{ json.text }}" }', hint: 'Ignored for GET. Sent as JSON when it parses as JSON.' },
      { key: 'continueOnError', label: 'Continue on HTTP error status', type: 'bool' },
    ],
  },
  set: {
    label: 'Set data',
    desc: 'Build a JSON object from earlier data',
    defaults: { json: '{\n  "value": "{{ json }}"\n}' },
    fields: [
      { key: 'json', label: 'Output (JSON with {{ }} expressions)', type: 'code', hint: 'A value that is only "{{ expr }}" keeps its type (number, object…).' },
    ],
  },
  code: {
    label: 'Code',
    desc: 'Run JavaScript and return a value',
    defaults: { code: '// json = previous output, steps["Name"] = earlier step output\nreturn { ...json, checkedAt: now };' },
    fields: [
      { key: 'code', label: 'JavaScript (async, return a value)', type: 'code', rows: 8, hint: 'Available: json, steps, trigger, now, fetch.' },
    ],
  },
  if: {
    label: 'Filter / If',
    desc: 'Stop the workflow unless a condition is true',
    defaults: { condition: 'json.status === 200' },
    fields: [
      { key: 'condition', label: 'Continue only if', type: 'text', placeholder: 'json.body.price < 100' },
    ],
  },
  wait: {
    label: 'Wait',
    desc: 'Pause for a few seconds',
    defaults: { seconds: 5 },
    fields: [
      { key: 'seconds', label: 'Seconds (max 300)', type: 'number' },
    ],
  },
};

function triggerText(t) {
  if (!t || t.type === 'manual') return 'Manual';
  if (t.type === 'webhook') return 'Webhook';
  if (t.mode === 'daily') return `Daily at ${t.time}`;
  return `Every ${t.intervalMinutes} min`;
}

function timeAgo(iso) {
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function duration(e) {
  if (!e.finishedAt) return '';
  const ms = new Date(e.finishedAt) - new Date(e.startedAt);
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function pretty(v) {
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
}

// ---------- views ----------

function renderLogin() {
  setChrome({ title: 'Flowlite' });
  const input = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
  const err = h('div', { class: 'error-text' });
  const form = h('form', {
    class: 'login',
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        await api('POST', '/api/login', { password: input.value });
        route();
      } catch (ex) {
        err.textContent = ex.message;
      }
    },
  },
  h('img', { src: 'icon.svg', alt: '' }),
  h('h2', {}, 'Sign in'),
  input,
  h('button', { class: 'primary', type: 'submit' }, 'Continue'),
  err);
  mount(form);
  input.focus();
}

async function renderList() {
  setChrome({
    title: 'Workflows',
    tab: 'workflows',
    actions: [h('button', { class: 'primary small', onclick: () => { location.hash = '#/wf/new'; } }, '+ New')],
  });
  const workflows = await api('GET', '/api/workflows');
  if (!workflows.length) {
    mount(h('div', { class: 'empty' }, 'No workflows yet. Tap “+ New” to create one.'));
    return;
  }
  mount(...workflows.map((w) => h('a', { class: 'card', href: `#/wf/${w.id}` },
    h('div', { class: 'row' },
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, w.name),
        h('div', { class: 'muted' }, `${triggerText(w.trigger)} · ${w.steps.length} step${w.steps.length === 1 ? '' : 's'}`)),
      w.trigger.type !== 'manual' ? h('span', { class: `badge ${w.active ? 'on' : ''}` }, w.active ? 'Active' : 'Off') : null))));
}

async function renderEditor(id) {
  const isNew = id === 'new';
  const wf = isNew
    ? { name: '', active: false, trigger: { type: 'manual' }, steps: [] }
    : await api('GET', `/api/workflows/${id}`);
  const state = JSON.parse(JSON.stringify(wf));

  async function save(quiet) {
    const saved = isNew && !state.id
      ? await api('POST', '/api/workflows', state)
      : await api('PUT', `/api/workflows/${state.id}`, state);
    Object.assign(state, saved);
    if (!quiet) toast('Saved');
    if (isNew) history.replaceState(null, '', `#/wf/${saved.id}`);
    draw();
    return saved;
  }

  async function run(btn) {
    btn.disabled = true;
    btn.textContent = 'Running…';
    try {
      const saved = await save(true);
      const execution = await api('POST', `/api/workflows/${saved.id}/run`, { input: {} });
      location.hash = `#/run/${execution.id}`;
    } catch (ex) {
      toast(ex.message);
      btn.disabled = false;
      btn.textContent = '▶ Run';
    }
  }

  function addStep() {
    const sheet = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === sheet) sheet.remove(); } },
      h('div', { class: 'sheet' },
        h('div', { class: 'section-label' }, 'Add step'),
        Object.entries(STEP_TYPES).map(([type, def]) => h('button', {
          onclick: () => {
            const n = state.steps.filter((s) => s.type === type).length + 1;
            state.steps.push({ id: uid(), type, name: n > 1 ? `${def.label} ${n}` : def.label, disabled: false, config: { ...def.defaults } });
            sheet.remove();
            draw();
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          },
        }, def.label, h('span', { class: 'muted' }, def.desc))),
        h('button', { onclick: () => sheet.remove() }, 'Cancel')));
    document.body.append(sheet);
  }

  function field(f, config) {
    const set = (v) => { config[f.key] = v; };
    if (f.type === 'bool') {
      return h('label', { class: 'switch' }, f.label,
        h('input', { type: 'checkbox', checked: Boolean(config[f.key]), onchange: (e) => set(e.target.checked) }));
    }
    let input;
    if (f.type === 'select') {
      input = h('select', { onchange: (e) => set(e.target.value) },
        f.options.map((o) => h('option', { value: o, selected: config[f.key] === o }, o)));
    } else if (f.type === 'code') {
      input = h('textarea', {
        rows: f.rows || 4, placeholder: f.placeholder, spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
        oninput: (e) => set(e.target.value),
      });
      input.value = config[f.key] ?? '';
    } else {
      input = h('input', {
        type: f.type === 'number' ? 'number' : 'text', inputmode: f.type === 'number' ? 'decimal' : undefined,
        placeholder: f.placeholder, value: config[f.key] ?? '', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
        oninput: (e) => set(f.type === 'number' ? Number(e.target.value) : e.target.value),
      });
    }
    return [h('label', {}, f.label), input, f.hint ? h('div', { class: 'hint' }, f.hint) : null];
  }

  function stepCard(step, i) {
    const def = STEP_TYPES[step.type];
    const move = (d) => {
      const j = i + d;
      if (j < 0 || j >= state.steps.length) return;
      [state.steps[i], state.steps[j]] = [state.steps[j], state.steps[i]];
      draw();
    };
    return [
      h('div', { class: 'connector' }),
      h('div', { class: `card step ${step.disabled ? 'disabled' : ''}` },
        h('div', { class: 'step-head' },
          h('span', { class: 'step-num' }, i + 1),
          h('span', { class: 'step-type' }, def ? def.label : step.type),
          h('button', { class: 'small', 'aria-label': 'Move up', onclick: () => move(-1), disabled: i === 0 }, '↑'),
          h('button', { class: 'small', 'aria-label': 'Move down', onclick: () => move(1), disabled: i === state.steps.length - 1 }, '↓'),
          h('button', {
            class: 'small danger', 'aria-label': 'Delete step',
            onclick: () => { if (confirm(`Delete “${step.name}”?`)) { state.steps.splice(i, 1); draw(); } },
          }, '✕')),
        h('label', {}, 'Name'),
        h('input', { value: step.name, oninput: (e) => { step.name = e.target.value; } }),
        h('div', { class: 'hint' }, 'Later steps can use this output as ', h('code', {}, `steps["${step.name}"]`)),
        def ? def.fields.map((f) => field(f, step.config)) : null,
        h('label', { class: 'switch', style: 'margin-top:12px' }, 'Skip this step',
          h('input', { type: 'checkbox', checked: step.disabled, onchange: (e) => { step.disabled = e.target.checked; draw(); } }))),
    ];
  }

  function triggerCard() {
    const t = state.trigger;
    const parts = [
      h('label', {}, 'Starts when'),
      h('select', {
        onchange: (e) => {
          state.trigger = { ...t, type: e.target.value };
          if (e.target.value === 'schedule') Object.assign(state.trigger, { mode: t.mode || 'interval', intervalMinutes: t.intervalMinutes || 60, time: t.time || '09:00' });
          draw();
        },
      }, Object.entries(TRIGGERS).map(([v, l]) => h('option', { value: v, selected: t.type === v }, l))),
    ];
    if (t.type === 'webhook') {
      if (t.webhookId) {
        const url = `${location.origin}/webhook/${t.webhookId}`;
        parts.push(h('label', {}, 'Webhook URL'),
          h('div', { class: 'copy-field' },
            h('input', { value: url, readonly: true }),
            h('button', { class: 'small', onclick: () => navigator.clipboard.writeText(url).then(() => toast('Copied')) }, 'Copy')),
          h('div', { class: 'hint' }, 'Any request to this URL runs the workflow (when active). Its data is in ', h('code', {}, 'trigger'), ' (method, query, headers, body). The last step’s output is sent back as the response.'));
      } else {
        parts.push(h('div', { class: 'hint' }, 'Save to get the webhook URL.'));
      }
    }
    if (t.type === 'schedule') {
      parts.push(h('label', {}, 'Repeat'),
        h('select', { onchange: (e) => { t.mode = e.target.value; draw(); } },
          h('option', { value: 'interval', selected: t.mode !== 'daily' }, 'Every N minutes'),
          h('option', { value: 'daily', selected: t.mode === 'daily' }, 'Every day at a time')));
      if (t.mode === 'daily') {
        parts.push(h('label', {}, 'Time (server time zone)'),
          h('input', { type: 'time', value: t.time, oninput: (e) => { t.time = e.target.value; } }));
      } else {
        parts.push(h('label', {}, 'Minutes'),
          h('input', { type: 'number', inputmode: 'numeric', min: 1, value: t.intervalMinutes, oninput: (e) => { t.intervalMinutes = Number(e.target.value); } }));
      }
    }
    if (t.type !== 'manual') {
      parts.push(h('label', { class: 'switch', style: 'margin-top:14px' }, 'Active',
        h('input', { type: 'checkbox', checked: state.active, onchange: (e) => { state.active = e.target.checked; } })));
    }
    return h('div', { class: 'card' }, parts);
  }

  function draw() {
    const runBtn = h('button', { class: 'primary small', onclick: (e) => run(e.currentTarget) }, '▶ Run');
    setChrome({
      title: state.name || 'New workflow',
      back: '#/',
      actions: [h('button', { class: 'small', onclick: () => save().catch((ex) => toast(ex.message)) }, 'Save'), runBtn],
    });
    mount(
      h('div', { class: 'card' },
        h('label', {}, 'Workflow name'),
        h('input', { value: state.name, placeholder: 'e.g. Price alert', oninput: (e) => { state.name = e.target.value; $title.textContent = e.target.value || 'New workflow'; } })),
      h('div', { class: 'section-label' }, 'Trigger'),
      triggerCard(),
      h('div', { class: 'section-label' }, 'Steps'),
      state.steps.length ? state.steps.map(stepCard) : h('div', { class: 'muted', style: 'margin:0 4px 12px' }, 'No steps yet.'),
      h('button', { style: 'width:100%', onclick: addStep }, '+ Add step'),
      state.id ? h('div', { class: 'btn-row', style: 'margin-top:24px' },
        h('button', { onclick: () => { location.hash = `#/runs/${state.id}`; } }, 'Run history'),
        h('button', {
          class: 'danger',
          onclick: async () => {
            if (!confirm(`Delete workflow “${state.name}”?`)) return;
            await api('DELETE', `/api/workflows/${state.id}`);
            location.hash = '#/';
          },
        }, 'Delete')) : null,
    );
  }

  draw();
}

async function renderRuns(workflowId) {
  const qs = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';
  setChrome({
    title: workflowId ? 'Run history' : 'Runs',
    back: workflowId ? `#/wf/${workflowId}` : null,
    tab: workflowId ? null : 'runs',
    actions: [h('button', {
      class: 'small',
      onclick: async () => {
        if (!confirm('Clear run history?')) return;
        await api('DELETE', `/api/executions${qs}`);
        route();
      },
    }, 'Clear')],
  });
  const runs = await api('GET', `/api/executions${qs}`);
  if (!runs.length) {
    mount(h('div', { class: 'empty' }, 'No runs yet.'));
    return;
  }
  mount(...runs.map((e) => h('a', { class: 'card', href: `#/run/${e.id}` },
    h('div', { class: 'row' },
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, e.workflowName),
        h('div', { class: 'muted' }, `${e.mode} · ${timeAgo(e.startedAt)} · ${duration(e)}`)),
      h('span', { class: `badge ${e.status}` }, e.status)),
    e.error ? h('div', { class: 'error-text' }, e.error) : null)));
}

async function renderRun(id) {
  const e = await api('GET', `/api/executions/${id}`);
  setChrome({
    title: e.workflowName,
    back: `#/runs/${e.workflowId}`,
    actions: [h('button', { class: 'small', onclick: () => { location.hash = `#/wf/${e.workflowId}`; } }, 'Edit')],
  });
  const triggerData = e.trigger && Object.keys(e.trigger).length ? e.trigger : null;
  mount(
    h('div', { class: 'card' },
      h('div', { class: 'row' },
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, `Run ${e.status}`),
          h('div', { class: 'muted' }, `${e.mode} · ${new Date(e.startedAt).toLocaleString()} · ${duration(e)}`)),
        h('span', { class: `badge ${e.status}` }, e.status)),
      e.status === 'stopped' ? h('div', { class: 'hint' }, 'A Filter / If step stopped the workflow.') : null),
    triggerData ? [h('div', { class: 'section-label' }, 'Trigger data'), h('div', { class: 'card' }, h('pre', {}, pretty(triggerData)))] : null,
    h('div', { class: 'section-label' }, 'Steps'),
    e.steps.length ? e.steps.map((s, i) => h('details', { class: 'card', open: s.status === 'error' || i === e.steps.length - 1 },
      h('summary', { class: 'row' },
        h('span', { class: 'step-num' }, i + 1),
        h('span', { class: 'grow title' }, s.name),
        h('span', { class: 'muted' }, `${s.ms} ms`),
        h('span', { class: `badge ${s.status}` }, s.status)),
      s.error ? h('div', { class: 'error-text' }, s.error) : h('pre', {}, pretty(s.output)))) : h('div', { class: 'muted' }, 'No steps ran.'),
  );
}

// ---------- router ----------

async function route() {
  const hash = location.hash || '#/';
  let m;
  try {
    if ((m = hash.match(/^#\/wf\/([\w-]+)$/))) await renderEditor(m[1]);
    else if ((m = hash.match(/^#\/runs\/([\w-]+)$/))) await renderRuns(m[1]);
    else if (hash === '#/runs') await renderRuns();
    else if ((m = hash.match(/^#\/run\/([\w-]+)$/))) await renderRun(m[1]);
    else await renderList();
    window.scrollTo(0, 0);
  } catch (ex) {
    if (ex.message !== 'Not logged in') {
      mount(h('div', { class: 'card error-text' }, ex.message));
    }
  }
}

window.addEventListener('hashchange', route);
route();
