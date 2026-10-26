'use strict';

(function () {
  const Engine = window.FlowEngine;
  const { icon } = window.FlowIcons;
  const { Canvas, Graph } = window.FlowCanvas;
  const { NDV } = window.FlowNDV;
  const LOCAL = Boolean(window.FLOWLITE_LOCAL);
  const backend = LOCAL ? new window.FlowBackend.LocalBackend(previewSeed) : new window.FlowBackend.RemoteBackend();

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

  function h(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (k === 'value') e.value = v;
      else if (k === 'checked') e.checked = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }

  const $app = document.getElementById('app');
  const $toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  document.body.append($toasts);

  function toast(kind, title, message, ms = 3000) {
    const t = h('div', { class: `toast ${kind}` },
      h('div', { class: 'toast-icon' }, icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info', 16)),
      h('div', { class: 'toast-body' }, h('div', { class: 'toast-title' }, title), message ? h('div', { class: 'toast-msg' }, message) : null),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Dismiss', onclick: () => t.remove() }, icon('x', 14)));
    $toasts.append(t);
    while ($toasts.children.length > 3) $toasts.firstChild.remove();
    if (ms) setTimeout(() => t.remove(), kind === 'error' ? ms * 2 : ms);
  }

  async function copy(text, message = 'Copied to clipboard') {
    try {
      await navigator.clipboard.writeText(text);
      toast('success', message);
    } catch {
      openModal({ title: 'Copy', body: h('textarea', { class: 'code-input', rows: 6, readonly: true, value: text, onfocus: (e) => e.target.select() }), actions: [{ label: 'Done', primary: true }] });
    }
  }

  function timeAgo(iso) {
    if (!iso) return '';
    const s = Math.round((Date.now() - new Date(iso)) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? '' : 's'} ago`;
    if (s < 86400) return `${Math.round(s / 3600)} hour${Math.round(s / 3600) === 1 ? '' : 's'} ago`;
    const d = Math.round(s / 86400);
    return d < 30 ? `${d} day${d === 1 ? '' : 's'} ago` : new Date(iso).toLocaleDateString();
  }

  function duration(e) {
    if (!e.stoppedAt) return '';
    const ms = new Date(e.stoppedAt) - new Date(e.startedAt);
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
  }

  function nodeIcon(type, size = 18) {
    const def = Engine.NODE_TYPES[type];
    const i = icon(def ? def.icon : 'unknown', size);
    i.style.color = def ? def.color : 'var(--muted)';
    return i;
  }

  // ---------------------------------------------------------------------------
  // Modals
  // ---------------------------------------------------------------------------

  function openModal({ title, body, actions = [], wide, onClose }) {
    const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const footer = h('div', { class: 'modal-footer' }, actions.map((a) => h('button', {
      type: 'button', class: `btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-secondary'}`,
      onclick: async (e) => {
        if (a.onClick) {
          e.currentTarget.disabled = true;
          try {
            if ((await a.onClick()) === false) { e.currentTarget.disabled = false; return; }
          } catch (err) {
            e.currentTarget.disabled = false;
            toast('error', 'Something went wrong', err.message);
            return;
          }
        }
        close();
      },
    }, a.label)));
    const modal = h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-header' }, h('h3', {}, title), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x', 16))),
      h('div', { class: 'modal-body' }, body), actions.length ? footer : null);
    const backdrop = h('div', { class: 'modal-backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } }, modal);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    return { close, modal };
  }

  function confirmDialog({ title, message, confirmLabel = 'Confirm', danger, cancelLabel = 'Cancel', extra }) {
    return new Promise((resolve) => {
      let result = null;
      openModal({
        title, body: h('p', {}, message),
        actions: [
          ...(extra ? [{ label: extra.label, onClick: () => { result = extra.value; } }] : []),
          { label: cancelLabel, onClick: () => { result = false; } },
          { label: confirmLabel, primary: !danger, danger, onClick: () => { result = true; } },
        ],
        onClose: () => resolve(result === null ? false : result),
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Credentials
  // ---------------------------------------------------------------------------

  let credentialsCache = [];
  async function loadCredentials() {
    credentialsCache = await backend.listCredentials();
    return credentialsCache;
  }

  async function openCredential({ id, type, onSaved } = {}) {
    if (!id && !type) {
      const list = h('div', { class: 'type-list' });
      const search = h('input', { type: 'search', placeholder: 'Search for app…', class: 'search-input' });
      const draw = () => {
        const q = search.value.toLowerCase();
        list.replaceChildren(...Object.entries(Engine.CREDENTIAL_TYPES).filter(([, d]) => d.displayName.toLowerCase().includes(q)).map(([t, d]) => h('button', {
          type: 'button', class: 'type-item', onclick: () => { m.close(); openCredential({ type: t, onSaved }); },
        }, icon(d.icon || 'key', 18), d.displayName)));
      };
      search.addEventListener('input', draw);
      draw();
      const m = openModal({ title: 'Add new credential', body: h('div', {}, h('p', { class: 'muted' }, 'Select an app or service to connect to'), search, list) });
      return;
    }
    const existing = id ? await backend.getCredential(id) : null;
    const ctype = existing ? existing.type : type;
    const def = Engine.CREDENTIAL_TYPES[ctype];
    const data = { ...(existing ? existing.data : {}) };
    const name = h('input', { class: 'cred-name', value: existing ? existing.name : `${def.displayName} account`, 'aria-label': 'Credential name' });
    const fields = def.properties.map((p) => {
      const secret = p.typeOptions && p.typeOptions.password;
      const isMasked = data[p.name] === '__flowlite_unchanged__';
      const input = h('input', {
        type: secret ? 'password' : 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
        placeholder: isMasked ? '•••••••• (saved — type to replace)' : p.placeholder || '',
        value: isMasked ? '' : data[p.name] ?? p.default ?? '',
        oninput: (e) => { data[p.name] = e.target.value; },
      });
      if (isMasked) input.addEventListener('blur', () => { if (!input.value) data[p.name] = '__flowlite_unchanged__'; });
      return h('div', { class: 'param' }, h('div', { class: 'param-label' }, h('label', {}, p.displayName)), input, p.description ? h('div', { class: 'param-hint' }, p.description) : null);
    });
    const body = h('div', {},
      h('div', { class: 'param' }, h('div', { class: 'param-label' }, h('label', {}, 'Credential name')), name),
      h('div', { class: 'section-title' }, `Connection · ${def.displayName}`),
      fields,
      h('p', { class: 'muted small' }, LOCAL ? 'In the preview, credentials are saved in this browser only.' : 'Credentials are encrypted on the server and are never shown again in full.'));
    openModal({
      title: existing ? existing.name : `New ${def.displayName} credential`,
      body,
      actions: [
        ...(existing ? [{
          label: 'Delete', danger: true,
          onClick: async () => {
            const ok = await confirmDialog({ title: 'Delete credential', message: `Are you sure you want to delete “${existing.name}”? Nodes that use it will stop working.`, confirmLabel: 'Delete', danger: true });
            if (!ok) return false;
            await backend.deleteCredential(existing.id);
            await loadCredentials();
            toast('success', 'Credential deleted');
            render();
          },
        }] : []),
        {
          label: 'Save', primary: true,
          onClick: async () => {
            const payload = { name: name.value.trim() || `${def.displayName} account`, type: ctype, data };
            const saved = existing ? await backend.updateCredential(existing.id, payload) : await backend.createCredential(payload);
            await loadCredentials();
            toast('success', 'Credential saved', saved.name);
            if (onSaved) onSaved(saved);
            if (route.startsWith('home/')) render();
          },
        },
      ],
    });
  }

  // ---------------------------------------------------------------------------
  // Node creator (the "+" panel)
  // ---------------------------------------------------------------------------

  function openNodeCreator({ triggersOnly, onPick }) {
    let view = triggersOnly ? 'triggers' : 'root';
    let category = null;
    const search = h('input', { type: 'search', class: 'search-input', placeholder: 'Search nodes…', 'aria-label': 'Search nodes' });
    const list = h('div', { class: 'nc-list' });
    const titleEl = h('div', { class: 'nc-title' });
    const close = () => { panel.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && e.target === search) { const first = list.querySelector('.nc-item'); if (first) first.click(); }
    };
    const pick = (type) => { close(); onPick(type); };
    const nodeItem = (type) => {
      const def = Engine.NODE_TYPES[type];
      return h('button', { type: 'button', class: 'nc-item', onclick: () => pick(type) },
        h('span', { class: 'nc-icon' }, nodeIcon(type, 22)),
        h('span', { class: 'nc-text' }, h('span', { class: 'nc-name' }, def.trigger ? def.triggerLabel || def.displayName : def.displayName), h('span', { class: 'nc-desc' }, def.description)));
    };
    const all = Object.keys(Engine.NODE_TYPES);
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const back = view !== 'root' && !triggersOnly
        ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Back', onclick: () => { view = 'root'; category = null; draw(); } }, icon('chevronLeft', 18)) : null;
      if (q) {
        titleEl.replaceChildren(h('span', {}, 'Search results'));
        const pool = triggersOnly || view === 'triggers' ? all.filter((t) => Engine.NODE_TYPES[t].trigger) : all;
        const hits = pool.filter((t) => {
          const d = Engine.NODE_TYPES[t];
          return `${d.displayName} ${d.triggerLabel || ''} ${d.description} ${t}`.toLowerCase().includes(q);
        });
        list.replaceChildren(...(hits.length ? hits.map(nodeItem) : [h('div', { class: 'nc-empty' }, 'We didn’t find a match. Use the HTTP Request node to connect to any API.')]));
        return;
      }
      if (view === 'triggers') {
        titleEl.replaceChildren(back || '', h('span', {}, 'What triggers this workflow?'));
        list.replaceChildren(h('p', { class: 'nc-sub' }, 'A trigger is a step that starts your workflow'), ...all.filter((t) => Engine.NODE_TYPES[t].trigger).map(nodeItem));
      } else if (view === 'category') {
        titleEl.replaceChildren(back, h('span', {}, category.name));
        list.replaceChildren(...all.filter((t) => Engine.NODE_TYPES[t].category === category.id).sort((a, b) => Engine.NODE_TYPES[a].displayName.localeCompare(Engine.NODE_TYPES[b].displayName)).map(nodeItem));
      } else {
        titleEl.replaceChildren(h('span', {}, 'What happens next?'));
        list.replaceChildren(
          ...Engine.CATEGORIES.map((c) => h('button', { type: 'button', class: 'nc-item', onclick: () => { view = 'category'; category = c; draw(); } },
            h('span', { class: 'nc-icon cat' }, icon(c.icon, 20)), h('span', { class: 'nc-text' }, h('span', { class: 'nc-name' }, c.name), h('span', { class: 'nc-desc' }, c.description)), icon('chevronRight', 16, 'nc-chev'))),
          h('button', { type: 'button', class: 'nc-item', onclick: () => { view = 'triggers'; draw(); } },
            h('span', { class: 'nc-icon cat' }, icon('zap', 20)), h('span', { class: 'nc-text' }, h('span', { class: 'nc-name' }, 'Add another trigger'), h('span', { class: 'nc-desc' }, 'Triggers start your workflow. Workflows can have multiple triggers.')), icon('chevronRight', 16, 'nc-chev')));
      }
    };
    search.addEventListener('input', draw);
    const panel = h('div', { class: 'nc-backdrop', onmousedown: (e) => { if (e.target === panel) close(); } },
      h('aside', { class: 'node-creator', role: 'dialog', 'aria-label': 'Add node' },
        h('div', { class: 'nc-head' }, titleEl, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x', 16))),
        h('div', { class: 'nc-search' }, icon('search', 16), search),
        list));
    document.body.append(panel);
    document.addEventListener('keydown', onKey);
    draw();
    if (window.matchMedia('(pointer: fine)').matches) search.focus();
  }

  // ---------------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------------

  let route = '';
  let editor = null; // state for the open workflow

  function currentHashRoute() {
    return (location.hash || '').replace(/^#\/?/, '') || 'home/workflows';
  }

  async function navigate(next, { replace, force } = {}) {
    if (!force && editor && editor.dirty && !next.startsWith(`workflow/${editor.workflow.id || 'new'}`)) {
      const choice = await confirmDialog({
        title: 'Save changes before leaving?', message: 'If you don’t save, you will lose your changes.',
        confirmLabel: 'Save', cancelLabel: 'Cancel', extra: { label: 'Leave without saving', value: 'leave' },
      });
      if (choice === false) return;
      if (choice === true && !(await saveWorkflow())) return;
      editor.dirty = false;
    }
    if (LOCAL) {
      route = next;
      render();
    } else if (replace) {
      history.replaceState(null, '', `#/${next}`);
      route = next;
      render();
    } else if (currentHashRoute() === next) {
      route = next;
      render();
    } else location.hash = `#/${next}`;
  }

  if (!LOCAL) {
    window.addEventListener('hashchange', () => {
      const next = currentHashRoute();
      if (next !== route) {
        route = next;
        render();
      }
    });
  }

  window.addEventListener('beforeunload', (e) => {
    if (editor && editor.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------------------------------------------------------------------------
  // Shell
  // ---------------------------------------------------------------------------

  function logo(size = 28) {
    return h('span', { class: 'logo', style: `width:${size}px;height:${size}px` }, icon('merge', Math.round(size * 0.62)));
  }

  function sidebar(active) {
    const item = (r, ic, label) => h('button', { type: 'button', class: `side-item ${active === r ? 'on' : ''}`, title: label, onclick: () => navigate(r) }, icon(ic, 18), h('span', { class: 'side-label' }, label));
    return h('nav', { class: 'sidebar', 'aria-label': 'Main' },
      h('div', { class: 'side-brand' }, logo(28), h('span', { class: 'side-label brand-name' }, 'Flowlite')),
      item('home/workflows', 'home', 'Overview'),
      item('home/credentials', 'key', 'Credentials'),
      item('home/executions', 'list', 'Executions'),
      h('div', { class: 'side-spacer' }),
      LOCAL ? h('div', { class: 'side-note side-label' }, 'Preview mode') : h('button', {
        type: 'button', class: 'side-item', title: 'Sign out',
        onclick: async () => { await backend.logout(); location.reload(); },
      }, icon('logout', 18), h('span', { class: 'side-label' }, 'Sign out')));
  }

  async function render() {
    if (!route) route = LOCAL ? 'home/workflows' : currentHashRoute();
    const parts = route.split('/');
    try {
      if (parts[0] === 'workflow') return await renderEditor(parts[1], parts[2] === 'executions' ? parts[3] || '' : null);
      if (editor && editor.ndv) editor.ndv.close();
      editor = null;
      return await renderHome(parts[1] || 'workflows');
    } catch (err) {
      if (err.status === 401) return renderLogin();
      console.error(err);
      $app.replaceChildren(h('div', { class: 'fatal' }, h('h2', {}, 'Something went wrong'), h('p', {}, err.message), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => navigate('home/workflows', { force: true }) }, 'Go to Overview')));
    }
  }

  function renderLogin() {
    const input = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', 'aria-label': 'Password' });
    const err = h('div', { class: 'err-text small' });
    const form = h('form', {
      class: 'login-card',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        try {
          await backend.login(input.value);
          await backend.me();
          render();
        } catch (ex) {
          err.textContent = ex.message;
        }
      },
    }, h('div', { class: 'login-brand' }, logo(40), h('span', {}, 'Flowlite')), h('h1', {}, 'Sign in'), input, h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Sign in'), err);
    $app.replaceChildren(h('div', { class: 'login' }, form));
    input.focus();
  }

  // ---------------------------------------------------------------------------
  // Overview
  // ---------------------------------------------------------------------------

  async function renderHome(tab) {
    const [workflows, executions] = await Promise.all([backend.listWorkflows(), tab === 'executions' ? backend.listExecutions() : null, loadCredentials()]);
    const main = h('main', { class: 'home' });
    const createBtn = h('div', { class: 'split-btn' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => navigate('workflow/new') }, 'Create Workflow'),
      h('button', { type: 'button', class: 'btn btn-primary split-more', 'aria-label': 'More create options', onclick: (e) => menu(e.currentTarget, [
        { label: 'Create Credential', onClick: () => openCredential({}) },
        { label: 'Import workflow from JSON', onClick: () => importDialog() },
      ]) }, icon('chevronDown', 14)));
    const tabs = h('div', { class: 'tabs', role: 'tablist' },
      [['workflows', 'Workflows'], ['credentials', 'Credentials'], ['executions', 'Executions']].map(([k, l]) => h('button', {
        type: 'button', role: 'tab', class: tab === k ? 'on' : '', onclick: () => navigate(`home/${k}`),
      }, l)));
    main.append(
      h('header', { class: 'home-head' },
        h('div', {}, h('h1', {}, 'Overview'), h('p', { class: 'muted' }, 'All the workflows, credentials and executions you have access to')),
        createBtn),
      tabs);
    if (LOCAL) {
      main.append(h('div', { class: 'banner' }, icon('info', 16), h('span', {}, 'This is the in-browser preview. Everything runs in your browser and is saved here only. HTTP requests to outside APIs are blocked; deploy Flowlite to your own server for real webhooks, schedules and API calls.')));
    }
    if (tab === 'workflows') main.append(workflowList(workflows));
    if (tab === 'credentials') main.append(credentialList());
    if (tab === 'executions') main.append(executionList(executions, workflows));
    $app.replaceChildren(h('div', { class: 'shell' }, sidebar(`home/${tab}`), main));
  }

  function workflowList(workflows) {
    if (!workflows.length) {
      return h('div', { class: 'empty-state' },
        h('h2', {}, '👋 Welcome!'), h('p', { class: 'muted' }, 'Create your first workflow'),
        h('div', { class: 'start-cards' },
          h('button', { type: 'button', class: 'start-card', onclick: () => navigate('workflow/new') }, icon('plus', 28), h('strong', {}, 'Start from scratch')),
          h('button', { type: 'button', class: 'start-card', onclick: () => importDialog() }, icon('upload', 28), h('strong', {}, 'Import n8n JSON'))));
    }
    const search = h('input', { type: 'search', class: 'search-input', placeholder: 'Search', 'aria-label': 'Search workflows' });
    const sort = h('select', { 'aria-label': 'Sort' }, h('option', {}, 'Sort by last updated'), h('option', {}, 'Sort by name (A-Z)'));
    const list = h('div', { class: 'list' });
    const draw = () => {
      const q = search.value.toLowerCase();
      const rows = workflows.filter((w) => w.name.toLowerCase().includes(q))
        .sort((a, b) => (sort.selectedIndex === 1 ? a.name.localeCompare(b.name) : new Date(b.updatedAt) - new Date(a.updatedAt)));
      list.replaceChildren(...rows.map((w) => h('div', { class: 'row-card', role: 'link', tabindex: '0', onclick: () => navigate(`workflow/${w.id}`), onkeydown: (e) => { if (e.key === 'Enter') navigate(`workflow/${w.id}`); } },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, w.name),
          h('div', { class: 'row-meta' }, `Last updated ${timeAgo(w.updatedAt)} | Created ${new Date(w.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`)),
        h('div', { class: 'row-icons hide-mobile' }, w.nodeTypes.slice(0, 5).map((t) => h('span', { class: 'mini-node' }, nodeIcon(t, 14)))),
        h('span', { class: `status-pill ${w.active ? 'on' : ''}` }, w.active ? 'Active' : 'Inactive'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Workflow actions', onclick: (e) => {
          e.stopPropagation();
          menu(e.currentTarget, [
            { label: 'Open', onClick: () => navigate(`workflow/${w.id}`) },
            { label: 'Duplicate', onClick: async () => { const full = await backend.getWorkflow(w.id); const { id, ...rest } = full; await backend.createWorkflow({ ...rest, name: `${full.name} copy`, active: false }); render(); } },
            { label: 'Delete', danger: true, onClick: async () => {
              if (!(await confirmDialog({ title: 'Delete workflow', message: `Are you sure you want to delete “${w.name}”?`, confirmLabel: 'Delete', danger: true }))) return;
              await backend.deleteWorkflow(w.id);
              toast('success', 'Workflow deleted');
              render();
            } },
          ]);
        } }, icon('more', 18)))));
      if (!rows.length) list.append(h('div', { class: 'muted pad' }, 'No workflows match your search.'));
    };
    search.addEventListener('input', draw);
    sort.addEventListener('change', draw);
    draw();
    return h('div', {}, h('div', { class: 'list-tools' }, search, sort), list);
  }

  function credentialList() {
    if (!credentialsCache.length) {
      return h('div', { class: 'empty-state' }, h('h2', {}, 'No credentials yet'),
        h('p', { class: 'muted' }, 'Credentials let workflows connect to your apps and services, like Telegram, Slack or OpenAI.'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openCredential({}) }, 'Add first credential'));
    }
    return h('div', { class: 'list' }, credentialsCache.map((c) => {
      const def = Engine.CREDENTIAL_TYPES[c.type];
      return h('div', { class: 'row-card', role: 'button', tabindex: '0', onclick: () => openCredential({ id: c.id }), onkeydown: (e) => { if (e.key === 'Enter') openCredential({ id: c.id }); } },
        h('span', { class: 'cred-icon' }, icon((def && def.icon) || 'key', 18)),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, c.name), h('div', { class: 'row-meta' }, `${def ? def.displayName : c.type} | Last updated ${timeAgo(c.updatedAt)}`)));
    }));
  }

  function statusBadge(status) {
    const label = { success: 'Success', error: 'Error', running: 'Running', waiting: 'Waiting' }[status] || status;
    return h('span', { class: `exec-status ${status}` }, label);
  }

  function executionList(executions) {
    if (!executions.length) return h('div', { class: 'empty-state' }, h('h2', {}, 'No executions yet'), h('p', { class: 'muted' }, 'When a workflow runs, its executions show up here.'));
    return h('div', { class: 'table-card' }, h('table', { class: 'exec-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Workflow'), h('th', {}, 'Status'), h('th', { class: 'hide-mobile' }, 'Started'), h('th', { class: 'hide-mobile' }, 'Run time'), h('th', { class: 'hide-mobile' }, 'Mode'))),
      h('tbody', {}, executions.map((e) => h('tr', { class: 'clickable', tabindex: '0', onclick: () => navigate(`workflow/${e.workflowId || 'new'}/executions/${e.id}`), onkeydown: (ev) => { if (ev.key === 'Enter') navigate(`workflow/${e.workflowId}/executions/${e.id}`); } },
        h('td', {}, h('div', { class: 'row-title' }, e.workflowName || 'Unsaved workflow'), h('div', { class: 'row-meta show-mobile' }, `${new Date(e.startedAt).toLocaleString()} · ${duration(e)}`)),
        h('td', {}, statusBadge(e.status)),
        h('td', { class: 'hide-mobile' }, new Date(e.startedAt).toLocaleString()),
        h('td', { class: 'hide-mobile' }, duration(e)),
        h('td', { class: 'hide-mobile' }, { manual: 'Manual', trigger: 'Schedule', webhook: 'Webhook' }[e.mode] || e.mode))))));
  }

  function menu(anchor, items) {
    document.querySelectorAll('.menu').forEach((m) => m.remove());
    const rect = anchor.getBoundingClientRect();
    const m = h('div', { class: 'menu', role: 'menu' }, items.map((it) => h('button', {
      type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', disabled: it.disabled,
      onclick: () => { m.remove(); it.onClick(); },
    }, it.label)));
    document.body.append(m);
    const w = m.offsetWidth;
    m.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - m.offsetHeight - 8)}px`;
    m.style.left = `${Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8))}px`;
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); } }), 0);
  }

  function importDialog() {
    const ta = h('textarea', { class: 'code-input', rows: 10, placeholder: 'Paste n8n workflow JSON here', spellcheck: 'false' });
    const file = h('input', { type: 'file', accept: '.json,application/json', onchange: async (e) => { const f = e.target.files[0]; if (f) ta.value = await f.text(); } });
    openModal({
      title: 'Import workflow',
      body: h('div', {}, h('p', { class: 'muted' }, 'Paste a workflow exported from n8n (or copied from the n8n canvas), or choose a .json file.'), ta, h('div', { class: 'pad-top' }, file)),
      actions: [{ label: 'Cancel' }, {
        label: 'Import', primary: true,
        onClick: async () => {
          let data;
          try { data = JSON.parse(ta.value); } catch { toast('error', 'That isn’t valid JSON'); return false; }
          if (!Array.isArray(data.nodes)) { toast('error', 'No nodes found', 'The JSON needs a "nodes" array.'); return false; }
          const wf = { name: data.name || 'Imported workflow', nodes: [], connections: {}, settings: data.settings || {}, active: false };
          Graph.importNodes(wf, data);
          const saved = await backend.createWorkflow(wf);
          const unknown = wf.nodes.filter((n) => !Engine.NODE_TYPES[n.type]).length;
          toast(unknown ? 'info' : 'success', 'Workflow imported', unknown ? `${unknown} node${unknown === 1 ? ' isn’t' : 's aren’t'} supported yet and will need replacing.` : null);
          navigate(`workflow/${saved.id}`, { force: true });
        },
      }],
    });
  }

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------

  function serialize(wf) {
    return { id: wf.id, name: wf.name, active: Boolean(wf.active), nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {}, pinData: wf.pinData || {} };
  }

  function setDirty(v) {
    if (!editor) return;
    editor.dirty = v;
    if (editor.saveBtn) {
      editor.saveBtn.textContent = v ? 'Save' : 'Saved';
      editor.saveBtn.classList.toggle('saved', !v);
      editor.saveBtn.disabled = !v;
    }
  }

  async function saveWorkflow() {
    if (!editor) return false;
    try {
      const data = serialize(editor.workflow);
      const saved = editor.workflow.id ? await backend.updateWorkflow(editor.workflow.id, data) : await backend.createWorkflow(data);
      const wasNew = !editor.workflow.id;
      Object.assign(editor.workflow, { id: saved.id, createdAt: saved.createdAt, updatedAt: saved.updatedAt });
      setDirty(false);
      if (wasNew) {
        if (LOCAL) route = `workflow/${saved.id}`;
        else { history.replaceState(null, '', `#/workflow/${saved.id}`); route = `workflow/${saved.id}`; }
      }
      return true;
    } catch (err) {
      toast('error', 'Problem saving workflow', err.message);
      return false;
    }
  }

  function pickStart(wf, destination) {
    let allowed = null;
    if (destination) { allowed = Engine.ancestorsOf(wf, destination); allowed.add(destination); }
    const roots = wf.nodes.filter((n) => (!allowed || allowed.has(n.name)) && !n.disabled && !Engine.parentsOf(wf, n.name).length)
      .sort((a, b) => a.position[0] - b.position[0]);
    return roots.find((n) => n.type === 'n8n-nodes-base.manualTrigger') || roots.find((n) => Engine.isTriggerNode(n)) || roots[0];
  }

  function lastItemsOf(name) {
    const runs = editor.execution && editor.execution.runData && editor.execution.runData[name];
    const run = runs && runs[runs.length - 1];
    return run && run.executionStatus !== 'error' && run.data && run.data[0] ? run.data[0] : null;
  }

  async function runWorkflowTo(destination) {
    if (!editor || editor.running) return;
    const wf = editor.workflow;
    if (!wf.nodes.length) return toast('info', 'Add a trigger to get started');
    const start = pickStart(wf, destination);
    let triggerItems;
    if (start && start.type === 'n8n-nodes-base.webhook') {
      triggerItems = lastItemsOf(start.name);
      if (!triggerItems) return startListening(start.name, destination);
    }
    editor.running = true;
    editor.runningNodes = new Set();
    updateRunUi();
    try {
      const execution = await backend.run({
        workflowData: serialize(wf), destinationNode: destination || undefined, startNode: start ? start.name : undefined, triggerItems,
      });
      showExecutionResult(execution, destination);
    } catch (err) {
      toast('error', 'Problem running workflow', err.message);
    } finally {
      editor.running = false;
      editor.runningNodes = new Set();
      updateRunUi();
    }
  }

  function showExecutionResult(execution, destination) {
    if (!editor) return;
    // A partial run keeps earlier data for nodes it didn't execute, like n8n.
    if (destination && editor.execution && editor.execution.runData) {
      execution.runData = { ...editor.execution.runData, ...execution.runData };
    }
    editor.execution = execution;
    if (execution.status === 'error') {
      toast('error', `Problem in node ‘${execution.error.node || ''}‘`, execution.error.message);
    } else {
      toast('success', destination ? 'Node executed successfully' : 'Workflow executed successfully');
    }
    editor.canvas.render();
    if (editor.ndv) {
      if (editor.ndv.mobileTab !== 'input') editor.ndv.mobileTab = 'output';
      editor.ndv.render();
    }
  }

  async function startListening(nodeName, destination) {
    if (!editor) return;
    const node = editor.workflow.nodes.find((n) => n.name === nodeName);
    if (LOCAL) return sampleEventDialog(node, destination);
    if (editor.listening) return;
    const ctrl = new AbortController();
    editor.listening = ctrl;
    updateRunUi();
    try {
      const execution = await backend.listen({ workflowData: serialize(editor.workflow), nodeName }, ctrl.signal);
      if (execution) showExecutionResult(execution);
      else toast('info', 'Stopped listening', 'No test event arrived within 2 minutes.');
    } catch (err) {
      if (err.name !== 'AbortError') toast('error', 'Problem listening for test event', err.message);
    } finally {
      if (editor) {
        editor.listening = null;
        updateRunUi();
      }
    }
  }

  function stopListening() {
    if (editor && editor.listening) editor.listening.abort();
  }

  function webhookTestUrl(node) {
    const p = Engine.resolveProperties(Engine.NODE_TYPES[node.type].properties, node.parameters);
    return `${backend.webhookBaseUrl}/webhook-test/${String(p.path || '').replace(/^\/+/, '')}`;
  }

  // Preview only: webhooks can't be called from outside, so let the user write the test request.
  function sampleEventDialog(node, destination) {
    const p = Engine.resolveProperties(Engine.NODE_TYPES[node.type].properties, node.parameters);
    const query = h('input', { value: '', placeholder: 'e.g. source=phone&id=7' });
    const body = h('textarea', { class: 'code-input', rows: 6, spellcheck: 'false' });
    body.value = '{\n  "name": "Ada Lovelace",\n  "email": "ada@example.com"\n}';
    openModal({
      title: 'Send a test event',
      body: h('div', {},
        h('p', { class: 'muted' }, `In the preview, webhooks can’t be called from outside, so write the request here. It is sent to the “${node.name}” node as a ${p.httpMethod} request.`),
        h('div', { class: 'param' }, h('div', { class: 'param-label' }, h('label', {}, 'Query string')), query),
        h('div', { class: 'param' }, h('div', { class: 'param-label' }, h('label', {}, 'JSON body')), body)),
      actions: [{ label: 'Cancel' }, {
        label: 'Send test event', primary: true,
        onClick: async () => {
          let json;
          try { json = body.value.trim() ? JSON.parse(body.value) : {}; } catch { toast('error', 'The body isn’t valid JSON'); return false; }
          const items = [{ json: { headers: { 'content-type': 'application/json', 'user-agent': 'Flowlite preview' }, params: {}, query: Object.fromEntries(new URLSearchParams(query.value)), body: json, webhookUrl: webhookTestUrl(node), executionMode: 'test' } }];
          editor.running = true;
          updateRunUi();
          try {
            showExecutionResult(await backend.run({ workflowData: serialize(editor.workflow), startNode: node.name, triggerItems: items, destinationNode: destination }), destination);
          } finally {
            editor.running = false;
            updateRunUi();
          }
        },
      }],
    });
  }

  function updateRunUi() {
    if (!editor) return;
    const btn = editor.runBtn;
    if (btn) {
      const listening = Boolean(editor.listening);
      btn.disabled = editor.running;
      btn.replaceChildren(icon(editor.running ? 'loader' : listening ? 'x' : 'flask', 16, editor.running ? 'spin' : ''),
        editor.running ? 'Executing workflow' : listening ? 'Stop listening' : 'Test workflow');
      btn.classList.toggle('listening', listening);
    }
    if (editor.listenBanner) editor.listenBanner.hidden = !editor.listening;
    if (editor.canvasWrap) editor.canvasWrap.classList.toggle('executing', editor.running);
    if (editor.canvas) editor.canvas.render();
    if (editor.ndv) editor.ndv.refresh();
  }

  let renderTimer;
  function scheduleCanvasRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => { if (editor && editor.canvas) editor.canvas.render(); }, 120);
  }

  function ndvApp(readOnlyCtx) {
    return {
      backend,
      workflow: () => (readOnlyCtx ? readOnlyCtx.workflow : editor.workflow),
      execution: () => (readOnlyCtx ? readOnlyCtx.execution : editor.execution),
      credentials: () => credentialsCache,
      openCredential,
      runNode: (name) => runWorkflowTo(name),
      listen: (name) => startListening(name),
      stopListening,
      isListening: () => Boolean(!readOnlyCtx && editor && editor.listening),
      isRunning: () => Boolean(!readOnlyCtx && editor && editor.running),
      runningNodes: () => (editor && editor.runningNodes) || new Set(),
      webhookTestUrl,
      preview: (nodeName, value) => Engine.previewExpression(readOnlyCtx ? readOnlyCtx.workflow : editor.workflow, readOnlyCtx ? readOnlyCtx.execution : editor.execution, nodeName, value),
      markDirty: () => { setDirty(true); scheduleCanvasRender(); },
      renameNode: (oldName, newName) => {
        const name = Graph.renameNode(editor.workflow, oldName, newName);
        const rd = editor.execution && editor.execution.runData;
        if (rd && rd[oldName] && name !== oldName) { rd[name] = rd[oldName]; delete rd[oldName]; }
        setDirty(true);
        editor.canvas.render();
        return name;
      },
      toast,
      copy,
      onNdvClosed: (ndv) => {
        if (readOnlyCtx) { if (readOnlyCtx.canvas) readOnlyCtx.canvas.render(); return; }
        if (editor && editor.ndv === ndv) editor.ndv = null;
        if (editor && editor.canvas) { editor.canvas.render(); editor.canvas.root.focus({ preventScroll: true }); }
      },
    };
  }

  function openNdv(name) {
    if (editor.ndv) editor.ndv.close();
    editor.ndv = new NDV(ndvApp(null), name);
  }

  function addNodeFlow(ctx = {}) {
    const wf = editor.workflow;
    const hasTrigger = wf.nodes.some((n) => Engine.isTriggerNode(n));
    openNodeCreator({
      triggersOnly: !hasTrigger && !ctx.source && !ctx.insert,
      onPick: (type) => {
        let position = ctx.position;
        const src = ctx.source && wf.nodes.find((n) => n.name === ctx.source.node);
        if (!position && src) {
          const outs = Engine.getOutputNames(src).length;
          position = [src.position[0] + 220, src.position[1] + (outs > 1 ? (ctx.source.output - (outs - 1) / 2) * 140 : 0)];
        }
        if (!position) {
          const sel = editor.canvas.selected && editor.canvas.selected.kind === 'node' && wf.nodes.find((n) => n.name === editor.canvas.selected.name);
          const last = sel || [...wf.nodes].sort((a, b) => b.position[0] - a.position[0])[0];
          position = last && !Engine.NODE_TYPES[type].trigger ? [last.position[0] + 220, last.position[1]] : editor.canvas.centerPosition();
          if (last && !ctx.source && !Engine.NODE_TYPES[type].trigger && !(Engine.getOutputNames(last).length && (wf.connections[last.name] || { main: [] }).main.some((l) => l && l.length))) {
            ctx = { ...ctx, source: { node: last.name, output: 0 } };
          }
        }
        // Avoid stacking directly on top of another node.
        while (wf.nodes.some((n) => Math.abs(n.position[0] - position[0]) < 60 && Math.abs(n.position[1] - position[1]) < 60)) position = [position[0], position[1] + 140];
        const node = Graph.addNode(wf, type, position);
        if (ctx.insert) {
          const e = ctx.insert;
          Graph.disconnect(wf, e.from, e.out, e.to, e.in);
          Graph.connect(wf, e.from, e.out, node.name, 0);
          if (Engine.getOutputNames(node).length) Graph.connect(wf, node.name, 0, e.to, e.in);
          // Make room: shift downstream nodes right.
          const shift = new Set([e.to, ...descendants(wf, e.to)]);
          wf.nodes.forEach((n) => { if (shift.has(n.name)) n.position = [n.position[0] + 220, n.position[1]]; });
          node.position = [wf.nodes.find((n) => n.name === e.from).position[0] + 220, wf.nodes.find((n) => n.name === e.from).position[1]];
        } else if (ctx.source && Engine.getInputNames(node).length) {
          Graph.connect(wf, ctx.source.node, ctx.source.output, node.name, 0);
        }
        editor.canvas.selected = { kind: 'node', name: node.name };
        setDirty(true);
        editor.canvas.render();
        openNdv(node.name);
      },
    });
  }

  function descendants(wf, name) {
    const out = new Set();
    const stack = [name];
    while (stack.length) {
      const n = stack.pop();
      for (const list of ((wf.connections[n] || {}).main || [])) for (const c of list || []) if (!out.has(c.node)) { out.add(c.node); stack.push(c.node); }
    }
    return out;
  }

  async function toggleActive(input) {
    const wf = editor.workflow;
    const want = input.checked;
    wf.active = want;
    if (await saveWorkflow()) {
      toast('success', want ? 'Workflow activated' : 'Workflow deactivated',
        want ? (LOCAL ? 'In the preview, schedules run only while this page is open.' : 'Its triggers will now run automatically.') : null);
    } else {
      wf.active = !want;
      input.checked = !want;
    }
    updateActiveLabel();
  }

  function updateActiveLabel() {
    if (editor && editor.activeLabel) editor.activeLabel.textContent = editor.workflow.active ? 'Active' : 'Inactive';
  }

  async function renderEditor(id, execView) {
    // Load (or keep) the workflow being edited.
    if (!editor || (id !== 'new' && editor.workflow.id !== id) || (id === 'new' && editor.workflow.id)) {
      if (editor && editor.ndv) editor.ndv.close();
      const wf = id === 'new'
        ? { name: 'My workflow', active: false, nodes: [], connections: {}, settings: {}, pinData: {} }
        : await backend.getWorkflow(id);
      wf.nodes = wf.nodes || [];
      wf.connections = wf.connections || {};
      editor = { workflow: wf, dirty: false, execution: null, running: false, runningNodes: new Set(), listening: null, ndv: null, fitted: false };
      loadCredentials().catch(() => {});
    }
    const wf = editor.workflow;
    const nameInput = h('input', { class: 'wf-name', value: wf.name, 'aria-label': 'Workflow name', oninput: (e) => { wf.name = e.target.value; setDirty(true); }, onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } });
    const activeInput = h('input', { type: 'checkbox', class: 'switch-input', checked: wf.active, 'aria-label': 'Active', onchange: (e) => toggleActive(e.target) });
    editor.activeLabel = h('span', { class: 'active-label hide-mobile' });
    editor.saveBtn = h('button', { type: 'button', class: 'btn btn-secondary save-btn', onclick: async () => { if (await saveWorkflow()) toast('success', 'Saved'); } });
    setDirty(editor.dirty);
    updateActiveLabel();
    const more = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Workflow menu', onclick: (e) => menu(e.currentTarget, [
      { label: 'Copy workflow JSON', onClick: () => copy(JSON.stringify(serialize(wf), null, 2), 'Workflow JSON copied') },
      ...(LOCAL ? [] : [{ label: 'Download', onClick: () => {
        const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(serialize(wf), null, 2)], { type: 'application/json' })), download: `${wf.name || 'workflow'}.json` });
        a.click();
      } }]),
      { label: 'Import from JSON…', onClick: () => pasteNodesDialog() },
      { label: 'Duplicate', disabled: !wf.id, onClick: async () => { const { id: _, ...rest } = serialize(wf); const saved = await backend.createWorkflow({ ...rest, name: `${wf.name} copy`, active: false }); navigate(`workflow/${saved.id}`); } },
      { label: 'Delete', danger: true, disabled: !wf.id, onClick: async () => {
        if (!(await confirmDialog({ title: 'Delete workflow', message: `Are you sure you want to delete “${wf.name}”?`, confirmLabel: 'Delete', danger: true }))) return;
        await backend.deleteWorkflow(wf.id);
        editor.dirty = false;
        toast('success', 'Workflow deleted');
        navigate('home/workflows', { force: true });
      } },
    ]) }, icon('more', 18));

    const wfBase = `workflow/${wf.id || 'new'}`;
    const header = h('header', { class: 'editor-head' },
      h('div', { class: 'eh-left' },
        h('button', { type: 'button', class: 'icon-btn show-mobile', 'aria-label': 'Back to overview', onclick: () => navigate('home/workflows') }, icon('chevronLeft', 20)),
        h('button', { type: 'button', class: 'crumb hide-mobile', onclick: () => navigate('home/workflows') }, 'Overview'),
        h('span', { class: 'crumb-sep hide-mobile' }, '/'),
        nameInput),
      h('div', { class: 'eh-tabs seg' },
        h('button', { type: 'button', class: execView === null ? 'on' : '', onclick: () => navigate(wfBase) }, 'Editor'),
        h('button', { type: 'button', class: execView !== null ? 'on' : '', disabled: !wf.id, onclick: () => navigate(`${wfBase}/executions`) }, 'Executions')),
      h('div', { class: 'eh-right' },
        h('label', { class: 'active-toggle', title: 'Activate to run triggers automatically' }, editor.activeLabel, h('span', { class: 'switch' }, activeInput, h('span', { class: 'slider' }))),
        editor.saveBtn, more));

    if (execView !== null) {
      $app.replaceChildren(h('div', { class: 'shell editor-shell' }, sidebar(''), h('main', { class: 'editor' }, header, await executionsView(wf, execView))));
      return;
    }

    // Canvas
    const empty = h('button', { type: 'button', class: 'add-first', onclick: () => addNodeFlow({}) }, h('span', { class: 'add-first-box' }, icon('plus', 32)), h('span', {}, 'Add first step…'));
    const canvas = new Canvas({
      getWorkflow: () => editor.workflow,
      getRunData: () => (editor.execution && editor.execution.runData) || {},
      getRunning: () => editor.runningNodes,
      onChange: () => { setDirty(true); editor.canvas.render(); },
      onOpenNode: (name) => openNdv(name),
      onAddNode: (ctx) => addNodeFlow(ctx),
      onRunNode: (name) => runWorkflowTo(name),
      onRender: () => {
        const hasNodes = editor.workflow.nodes.length > 0;
        empty.hidden = hasNodes;
        editor.runBtn.hidden = !hasNodes;
      },
      bottomPadding: 80,
    });
    editor.canvas = canvas;
    editor.runBtn = h('button', { type: 'button', class: 'btn btn-primary btn-lg run-btn', onclick: () => {
      if (editor.listening) return stopListening();
      runWorkflowTo();
    } });
    editor.listenBanner = h('div', { class: 'listen-banner' }, icon('webhook', 16), 'Waiting for you to call the Test URL');
    editor.listenBanner.hidden = !editor.listening;
    const ctl = (ic, label, fn) => h('button', { type: 'button', class: 'ctl', title: label, 'aria-label': label, onclick: fn }, icon(ic, 16));
    editor.canvasWrap = h('div', { class: 'canvas-wrap' },
      canvas.root,
      empty,
      h('button', { type: 'button', class: 'add-node-btn', title: 'Open nodes panel (Tab)', 'aria-label': 'Add node', onclick: () => addNodeFlow({}) }, icon('plus', 20)),
      h('div', { class: 'canvas-controls' },
        ctl('fit', 'Zoom to fit (1)', () => canvas.fitView()),
        ctl('zoomIn', 'Zoom in (+)', () => canvas.zoomAt(1.2)),
        ctl('zoomOut', 'Zoom out (-)', () => canvas.zoomAt(1 / 1.2)),
        ctl('reset', 'Reset zoom (0)', () => canvas.resetZoom())),
      h('div', { class: 'run-bar' }, editor.listenBanner, editor.runBtn));
    updateRunUi();

    $app.replaceChildren(h('div', { class: 'shell editor-shell' }, sidebar(''), h('main', { class: 'editor' }, header, editor.canvasWrap)));
    canvas.render();
    requestAnimationFrame(() => canvas.fitView());
  }

  function pasteNodesDialog() {
    const ta = h('textarea', { class: 'code-input', rows: 10, placeholder: 'Paste n8n nodes or workflow JSON', spellcheck: 'false' });
    openModal({
      title: 'Import from JSON',
      body: h('div', {}, h('p', { class: 'muted' }, 'Nodes are added to this workflow. Tip: on a computer you can also paste straight onto the canvas with Ctrl/⌘+V.'), ta),
      actions: [{ label: 'Cancel' }, { label: 'Import', primary: true, onClick: () => (pasteNodes(ta.value) ? undefined : false) }],
    });
  }

  function pasteNodes(text) {
    let data;
    try { data = JSON.parse(text); } catch { toast('error', 'That isn’t valid workflow JSON'); return false; }
    if (!data || !Array.isArray(data.nodes)) { toast('error', 'No nodes found', 'The JSON needs a "nodes" array.'); return false; }
    const at = editor.canvas.centerPosition();
    const added = Graph.importNodes(editor.workflow, data, editor.workflow.nodes.length ? at : null);
    if (!editor.workflow.name || editor.workflow.name === 'My workflow') editor.workflow.name = data.name || editor.workflow.name;
    setDirty(true);
    render();
    toast('success', `Added ${added.length} node${added.length === 1 ? '' : 's'}`);
    return true;
  }

  document.addEventListener('paste', (e) => {
    if (!editor || !editor.canvas || editor.ndv || document.querySelector('.modal-backdrop')) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (text && text.includes('"nodes"')) { e.preventDefault(); pasteNodes(text); }
  });

  document.addEventListener('keydown', (e) => {
    if (!editor || !editor.canvas) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 's') { e.preventDefault(); saveWorkflow().then((ok) => ok && toast('success', 'Saved')); }
    if (mod && e.key === 'Enter' && !editor.ndv) { e.preventDefault(); runWorkflowTo(); }
    if (mod && e.key === 'c' && !editor.ndv && document.activeElement === editor.canvas.root) {
      const sel = editor.canvas.selected;
      if (sel && sel.kind === 'node') {
        const node = editor.workflow.nodes.find((n) => n.name === sel.name);
        copy(JSON.stringify({ nodes: [node], connections: {} }, null, 2), 'Copied node');
      }
    }
  });

  async function executionsView(wf, execId) {
    const list = await backend.listExecutions(wf.id);
    const narrow = window.matchMedia('(max-width: 760px)').matches;
    if (!execId && list.length && !narrow) execId = list[0].id;
    const side = h('aside', { class: 'exec-side' },
      h('div', { class: 'exec-side-head' }, h('strong', {}, 'Executions'),
        list.length ? h('button', { type: 'button', class: 'link small', onclick: async () => {
          if (!(await confirmDialog({ title: 'Delete all executions', message: 'Delete all executions of this workflow?', confirmLabel: 'Delete', danger: true }))) return;
          await backend.deleteExecutions(wf.id);
          navigate(`workflow/${wf.id}/executions`);
        } }, 'Delete all') : null),
      list.length ? list.map((e) => h('button', {
        type: 'button', class: `exec-item ${e.status} ${e.id === execId ? 'on' : ''}`, onclick: () => navigate(`workflow/${wf.id}/executions/${e.id}`),
      }, h('span', { class: 'exec-when' }, new Date(e.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })),
      h('span', { class: 'exec-sub' }, e.status === 'success' ? `Succeeded in ${duration(e)}` : e.status === 'error' ? `Error in ${duration(e)}` : e.status,
        ' · ', { manual: 'Manual', trigger: 'Schedule', webhook: 'Webhook' }[e.mode] || e.mode)))
        : h('div', { class: 'muted pad' }, 'No executions yet. Test the workflow, or activate it so its triggers run.'));
    const detail = h('section', { class: 'exec-detail' });
    const layout = h('div', { class: `exec-layout ${execId ? 'has-detail' : ''}` }, side, detail);
    if (!execId) {
      detail.append(h('div', { class: 'panel-empty' }, h('strong', {}, list.length ? 'Select an execution' : 'No executions yet')));
      return layout;
    }
    const ex = await backend.getExecution(execId);
    const roWorkflow = { ...ex.workflowData, id: wf.id, name: wf.name };
    const ctx = { workflow: roWorkflow, execution: ex };
    const canvas = new Canvas({
      readOnly: true,
      getWorkflow: () => roWorkflow,
      getRunData: () => ex.runData,
      onChange: () => {},
      onOpenNode: (name) => { ctx.canvas = canvas; new NDV(ndvApp(ctx), name, { readOnly: true }); },
      onAddNode: () => {},
      onRunNode: () => {},
    });
    detail.append(
      h('div', { class: 'exec-detail-head' },
        h('button', { type: 'button', class: 'icon-btn show-mobile', 'aria-label': 'Back to list', onclick: () => navigate(`workflow/${wf.id}/executions`) }, icon('chevronLeft', 18)),
        h('div', {}, h('div', { class: 'row-title' }, new Date(ex.startedAt).toLocaleString()),
          h('div', { class: 'row-meta' }, statusBadge(ex.status), ` in ${duration(ex)} · ID#${ex.id.slice(0, 8)}`)),
        h('div', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => {
          editor.execution = ex;
          toast('success', 'Execution data loaded into the editor', 'Open any node to see this run’s data.');
          navigate(`workflow/${wf.id}`);
        } }, 'Debug in editor'),
        h('button', { type: 'button', class: 'icon-btn', title: 'Delete execution', 'aria-label': 'Delete execution', onclick: async () => {
          await backend.deleteExecution(ex.id);
          navigate(`workflow/${wf.id}/executions`);
        } }, icon('trash', 16))),
      ex.error ? h('div', { class: 'notice warn' }, `Problem in node ‘${ex.error.node || ''}‘: ${ex.error.message}`) : null,
      h('div', { class: 'canvas-wrap readonly' }, canvas.root, h('div', { class: 'canvas-controls' },
        h('button', { type: 'button', class: 'ctl', 'aria-label': 'Zoom to fit', onclick: () => canvas.fitView() }, icon('fit', 16)))),
      h('p', { class: 'muted small pad' }, 'Read-only. Double-click (or tap twice) a node to see its data.'));
    requestAnimationFrame(() => { canvas.render(); canvas.fitView(); });
    return layout;
  }

  // ---------------------------------------------------------------------------
  // Preview seed data
  // ---------------------------------------------------------------------------

  function previewSeed() {
    const id = () => Engine.uuid();
    const now = new Date().toISOString();
    const conn = (map) => Object.fromEntries(Object.entries(map).map(([from, outs]) => [from, { main: outs.map((list) => list.map((n) => (Array.isArray(n) ? { node: n[0], type: 'main', index: n[1] } : { node: n, type: 'main', index: 0 }))) }]));
    return [
      {
        id: id(), name: 'Large order alerts', active: false, createdAt: now, updatedAt: now, settings: {}, pinData: {},
        nodes: [
          { id: id(), name: 'When clicking ‘Test workflow’', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
          { id: id(), name: 'Get orders', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], parameters: { jsCode: "// Sample data. In a real workflow this would be an HTTP Request to your shop's API.\nreturn [\n  { id: 1041, customer: 'Ada Lovelace', total: 249.0, country: 'GB' },\n  { id: 1042, customer: 'Grace Hopper', total: 38.5, country: 'US' },\n  { id: 1043, customer: 'Katherine Johnson', total: 512.2, country: 'US' },\n  { id: 1044, customer: 'Hedy Lamarr', total: 74.99, country: 'AT' },\n];" } },
          { id: id(), name: 'Total over $100?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [440, 0], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ id: id(), leftValue: '={{ $json.total }}', rightValue: 100, operator: { type: 'number', operation: 'gt' } }], combinator: 'and' }, options: {} } },
          { id: id(), name: 'Write alert', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [680, -100], parameters: { assignments: { assignments: [
            { id: id(), name: 'message', value: '=Order #{{ $json.id }} from {{ $json.customer }}: ${{ $json.total.toFixed(2) }}', type: 'string' },
            { id: id(), name: 'checkedAt', value: "={{ $now.toFormat('yyyy-MM-dd HH:mm') }}", type: 'string' }] }, options: {} } },
          { id: id(), name: 'Small orders', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [680, 120], parameters: {} },
          { id: id(), name: 'Combine alerts', type: 'n8n-nodes-base.aggregate', typeVersion: 1, position: [900, -100], parameters: { aggregate: 'aggregateIndividualFields', fieldsToAggregate: { fieldToAggregate: [{ fieldToAggregate: 'message', renameField: true, outputFieldName: 'alerts' }] }, options: {} } },
        ],
        connections: conn({
          'When clicking ‘Test workflow’': [['Get orders']],
          'Get orders': [['Total over $100?']],
          'Total over $100?': [['Write alert'], ['Small orders']],
          'Write alert': [['Combine alerts']],
        }),
      },
      {
        id: id(), name: 'Daily summary', active: false, createdAt: now, updatedAt: now, settings: {}, pinData: {},
        nodes: [
          { id: id(), name: 'Every day at 9am', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: 'days', triggerAtHour: 9 }] } } },
          { id: id(), name: 'Format date', type: 'n8n-nodes-base.dateTime', typeVersion: 2, position: [220, 0], parameters: { operation: 'formatDate', date: '={{ $json.timestamp }}', format: 'custom', customFormat: "EEEE, d LLLL yyyy", outputFieldName: 'today' } },
          { id: id(), name: 'Build message', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [440, 0], parameters: { assignments: { assignments: [{ id: id(), name: 'text', value: '=Good morning! Today is {{ $json.today }}.', type: 'string' }] }, options: {} } },
        ],
        connections: conn({ 'Every day at 9am': [['Format date']], 'Format date': [['Build message']] }),
      },
      {
        id: id(), name: 'Contact form webhook', active: false, createdAt: now, updatedAt: now, settings: {}, pinData: {},
        nodes: [
          { id: id(), name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: 'contact-form', parameters: { httpMethod: 'POST', path: 'contact-form', responseMode: 'responseNode', options: {} } },
          { id: id(), name: 'Has email?', type: 'n8n-nodes-base.filter', typeVersion: 2.2, position: [220, 0], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ id: id(), leftValue: '={{ $json.body.email }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }], combinator: 'and' }, options: {} } },
          { id: id(), name: 'Respond to Webhook', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [440, 0], parameters: { respondWith: 'json', responseBody: '={\n  "ok": true,\n  "message": "Thanks {{ $json.body.name }}, we got your message."\n}', options: {} } },
        ],
        connections: conn({ Webhook: [['Has email?']], 'Has email?': [['Respond to Webhook']] }),
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  (async function start() {
    try {
      const me = await backend.me();
      if (!me.authed) return renderLogin();
    } catch (err) {
      $app.replaceChildren(h('div', { class: 'fatal' }, h('h2', {}, 'Can’t reach the server'), h('p', {}, err.message)));
      return;
    }
    if (LOCAL && backend.isNew) {
      // First visit to the preview: open the example with a finished test run so the canvas shows data.
      const [first] = await backend.listWorkflows();
      route = `workflow/${first.id}`;
      await render();
      await runWorkflowTo();
      return;
    }
    render();
  })();
})();
