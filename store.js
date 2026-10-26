'use strict';

// Tiny JSON-file storage. Everything is kept in memory and flushed to
// DATA_DIR with an atomic write (temp file + rename) on every change.

const fs = require('node:fs');
const path = require('node:path');

const MAX_EXECUTIONS = 200;
const MAX_ITEMS_PER_OUTPUT = 100;

// Keeps stored executions small: at most MAX_ITEMS_PER_OUTPUT items per node output.
function compactExecution(execution) {
  const runData = {};
  for (const [name, runs] of Object.entries(execution.runData || {})) {
    runData[name] = runs.map((run) => {
      const truncated = (run.data || []).some((out) => out && out.length > MAX_ITEMS_PER_OUTPUT);
      return {
        ...run,
        data: (run.data || []).map((out) => (out || []).slice(0, MAX_ITEMS_PER_OUTPUT)),
        ...(truncated ? { truncated: true } : {}),
      };
    });
  }
  return { ...execution, runData };
}

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    const workflows = this.#read('workflows.json', null);
    this.isNew = workflows === null;
    // Workflows saved by the first (linear) version of Flowlite have `steps`; they are dropped.
    this.workflows = (workflows || []).filter((w) => Array.isArray(w.nodes));
    this.executions = this.#read('executions.json', []).filter((e) => e.runData);
    this.credentials = this.#read('credentials.json', []);
  }

  #read(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.dir, file), 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') console.error(`Could not read ${file}:`, err.message);
      return fallback;
    }
  }

  #write(file, data) {
    const target = path.join(this.dir, file);
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, target);
  }

  // ----- workflows -----

  getWorkflow(id) {
    return this.workflows.find((w) => w.id === id);
  }

  saveWorkflow(workflow) {
    const i = this.workflows.findIndex((w) => w.id === workflow.id);
    if (i === -1) this.workflows.push(workflow);
    else this.workflows[i] = workflow;
    this.#write('workflows.json', this.workflows);
    return workflow;
  }

  deleteWorkflow(id) {
    this.workflows = this.workflows.filter((w) => w.id !== id);
    this.#write('workflows.json', this.workflows);
  }

  // ----- executions -----

  addExecution(execution) {
    this.executions.unshift(compactExecution(execution));
    this.executions.length = Math.min(this.executions.length, MAX_EXECUTIONS);
    this.#write('executions.json', this.executions);
  }

  getExecution(id) {
    return this.executions.find((e) => e.id === id);
  }

  deleteExecutions(filter) {
    this.executions = this.executions.filter((e) => !filter(e));
    this.#write('executions.json', this.executions);
  }

  // ----- credentials -----

  getCredential(id) {
    return this.credentials.find((c) => c.id === id);
  }

  saveCredential(credential) {
    const i = this.credentials.findIndex((c) => c.id === credential.id);
    if (i === -1) this.credentials.push(credential);
    else this.credentials[i] = credential;
    this.#write('credentials.json', this.credentials);
    return credential;
  }

  deleteCredential(id) {
    this.credentials = this.credentials.filter((c) => c.id !== id);
    this.#write('credentials.json', this.credentials);
  }
}

module.exports = { Store, compactExecution };
