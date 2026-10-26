'use strict';

// Two interchangeable backends for the editor:
//  - RemoteBackend talks to the Flowlite server (normal use).
//  - LocalBackend runs everything in the browser and keeps data in localStorage. It is used by the
//    single-file preview, where there is no server: webhooks can't be called from outside and
//    schedules only fire while the page is open.
(function () {
  const Engine = window.FlowEngine;

  class RemoteBackend {
    constructor() {
      this.local = false;
      this.webhookBaseUrl = location.origin;
    }

    async request(method, path, body, signal) {
      const res = await fetch(path, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || data.message || `Request failed (${res.status})`), { status: res.status });
      return data;
    }

    async me() {
      const me = await this.request('GET', '/api/me');
      if (me.webhookBaseUrl) this.webhookBaseUrl = me.webhookBaseUrl;
      return me;
    }
    login(password) { return this.request('POST', '/api/login', { password }); }
    logout() { return this.request('POST', '/api/logout', {}); }

    listWorkflows() { return this.request('GET', '/api/workflows'); }
    getWorkflow(id) { return this.request('GET', `/api/workflows/${id}`); }
    createWorkflow(wf) { return this.request('POST', '/api/workflows', wf); }
    updateWorkflow(id, wf) { return this.request('PUT', `/api/workflows/${id}`, wf); }
    deleteWorkflow(id) { return this.request('DELETE', `/api/workflows/${id}`, {}); }
    run(opts) { return this.request('POST', '/api/workflows/run', opts); }
    async listen(opts, signal) {
      try {
        return await this.request('POST', '/api/workflows/listen', opts, signal);
      } catch (err) {
        if (err.status === 408) return null;
        throw err;
      }
    }

    listExecutions(workflowId) { return this.request('GET', `/api/executions${workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : ''}`); }
    getExecution(id) { return this.request('GET', `/api/executions/${id}`); }
    deleteExecution(id) { return this.request('DELETE', `/api/executions/${id}`, {}); }
    deleteExecutions(workflowId) { return this.request('DELETE', `/api/executions${workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : ''}`, {}); }

    listCredentials() { return this.request('GET', '/api/credentials'); }
    getCredential(id) { return this.request('GET', `/api/credentials/${id}`); }
    createCredential(c) { return this.request('POST', '/api/credentials', c); }
    updateCredential(id, c) { return this.request('PATCH', `/api/credentials/${id}`, c); }
    deleteCredential(id) { return this.request('DELETE', `/api/credentials/${id}`, {}); }
  }

  // ---------------------------------------------------------------------------

  const KEY = 'flowlite:preview:v1';
  const MAX_EXECUTIONS = 50;

  class LocalBackend {
    constructor(seed) {
      this.local = true;
      this.webhookBaseUrl = 'https://your-flowlite-server.example';
      this.data = this.load() || { workflows: [], executions: [], credentials: [] };
      this.isNew = !this.data.workflows.length && !this.data.seeded;
      if (this.isNew && seed) {
        this.data.workflows.push(...seed());
        this.data.seeded = true;
        this.save();
      }
      setInterval(() => this.tick(), 60_000);
    }

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch {
        // Storage can be unavailable (private mode, blocked site data); keep working in memory.
      }
    }

    async me() { return { authed: true, passwordRequired: false }; }
    async login() { return { ok: true }; }
    async logout() { return { ok: true }; }

    summary(w) {
      return { id: w.id, name: w.name, active: w.active, createdAt: w.createdAt, updatedAt: w.updatedAt, nodeTypes: [...new Set(w.nodes.map((n) => n.type))] };
    }

    validate(wf) {
      const names = new Set();
      for (const n of wf.nodes || []) {
        if (names.has(n.name)) throw new Error(`There are two nodes called "${n.name}". Node names must be unique.`);
        names.add(n.name);
      }
      if (wf.active && !(wf.nodes || []).some((n) => !n.disabled && ['n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.webhook'].includes(n.type))) {
        throw new Error('Workflow could not be activated: it has no node to start the workflow. At least one trigger or webhook node (other than the manual trigger) is required.');
      }
    }

    async listWorkflows() { return this.data.workflows.map((w) => this.summary(w)); }
    async getWorkflow(id) {
      const w = this.data.workflows.find((x) => x.id === id);
      if (!w) throw new Error('Workflow not found');
      return Engine.clone(w);
    }
    async createWorkflow(wf) {
      this.validate(wf);
      const now = new Date().toISOString();
      const saved = { ...Engine.clone(wf), id: Engine.uuid(), name: wf.name || 'My workflow', createdAt: now, updatedAt: now };
      this.data.workflows.push(saved);
      this.save();
      return Engine.clone(saved);
    }
    async updateWorkflow(id, wf) {
      this.validate(wf);
      const i = this.data.workflows.findIndex((x) => x.id === id);
      if (i === -1) throw new Error('Workflow not found');
      const saved = { ...Engine.clone(wf), id, createdAt: this.data.workflows[i].createdAt, updatedAt: new Date().toISOString() };
      this.data.workflows[i] = saved;
      this.save();
      return Engine.clone(saved);
    }
    async deleteWorkflow(id) {
      this.data.workflows = this.data.workflows.filter((w) => w.id !== id);
      this.save();
    }

    async execute(workflow, opts) {
      const execution = await Engine.runWorkflow(workflow, {
        ...opts,
        maxWaitMs: 5 * 60_000,
        getCredential: async (ref, type) => {
          const c = this.data.credentials.find((x) => x.id === ref.id) || this.data.credentials.find((x) => x.type === type && x.name === ref.name);
          return c && c.type === type ? c.data : null;
        },
        fetch: async (...args) => {
          try {
            return await fetch(...args);
          } catch (err) {
            throw new Engine.NodeError('This preview can’t reach the internet', 'The browser preview blocks network requests. Deploy Flowlite to your own server to call real APIs.');
          }
        },
      });
      const stored = Engine.clone(execution);
      for (const runs of Object.values(stored.runData)) for (const run of runs) run.data = run.data.map((out) => out.slice(0, 50));
      this.data.executions.unshift(stored);
      this.data.executions.length = Math.min(this.data.executions.length, MAX_EXECUTIONS);
      this.save();
      return execution;
    }

    async run(opts) {
      return this.execute(opts.workflowData, { mode: 'manual', destinationNode: opts.destinationNode, startNode: opts.startNode, triggerItems: opts.triggerItems });
    }
    async listen() { throw new Error('Webhooks can’t receive outside calls in the preview'); }

    tick() {
      const now = new Date();
      for (const wf of this.data.workflows) {
        if (!wf.active) continue;
        for (const node of wf.nodes) {
          if (node.type === 'n8n-nodes-base.scheduleTrigger' && !node.disabled && Engine.isScheduleDue(node.parameters, now)) {
            this.execute(wf, { mode: 'trigger', startNode: node.name });
          }
        }
      }
    }

    async listExecutions(workflowId) {
      return this.data.executions.filter((e) => !workflowId || e.workflowId === workflowId)
        .map(({ runData, workflowData, ...rest }) => rest);
    }
    async getExecution(id) {
      const e = this.data.executions.find((x) => x.id === id);
      if (!e) throw new Error('Execution not found');
      return Engine.clone(e);
    }
    async deleteExecution(id) {
      this.data.executions = this.data.executions.filter((e) => e.id !== id);
      this.save();
    }
    async deleteExecutions(workflowId) {
      this.data.executions = this.data.executions.filter((e) => workflowId && e.workflowId !== workflowId);
      this.save();
    }

    async listCredentials() { return this.data.credentials.map(({ data, ...rest }) => rest); }
    async getCredential(id) {
      const c = this.data.credentials.find((x) => x.id === id);
      if (!c) throw new Error('Credential not found');
      return Engine.clone(c);
    }
    async createCredential(c) {
      const now = new Date().toISOString();
      const saved = { id: Engine.uuid(), name: c.name, type: c.type, data: { ...c.data }, createdAt: now, updatedAt: now };
      this.data.credentials.push(saved);
      this.save();
      const { data, ...rest } = saved;
      return rest;
    }
    async updateCredential(id, c) {
      const existing = this.data.credentials.find((x) => x.id === id);
      if (!existing) throw new Error('Credential not found');
      Object.assign(existing, { name: c.name || existing.name, data: { ...existing.data, ...c.data }, updatedAt: new Date().toISOString() });
      this.save();
      const { data, ...rest } = existing;
      return rest;
    }
    async deleteCredential(id) {
      this.data.credentials = this.data.credentials.filter((c) => c.id !== id);
      this.save();
    }
  }

  window.FlowBackend = { RemoteBackend, LocalBackend };
})();
