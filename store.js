'use strict';

// Tiny JSON-file storage. Everything is kept in memory and flushed to
// DATA_DIR with an atomic write (temp file + rename) on every change.

const fs = require('node:fs');
const path = require('node:path');

const MAX_EXECUTIONS = 200;

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.workflows = this.#read('workflows.json', null);
    this.executions = this.#read('executions.json', []);
    this.isNew = this.workflows === null;
    if (this.isNew) this.workflows = [];
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
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, target);
  }

  getWorkflow(id) {
    return this.workflows.find((w) => w.id === id);
  }

  findByWebhook(hookId) {
    return this.workflows.find((w) => w.trigger && w.trigger.type === 'webhook' && w.trigger.webhookId === hookId);
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

  addExecution(execution) {
    this.executions.unshift(execution);
    this.executions.length = Math.min(this.executions.length, MAX_EXECUTIONS);
    this.#write('executions.json', this.executions);
  }

  getExecution(id) {
    return this.executions.find((e) => e.id === id);
  }

  clearExecutions(workflowId) {
    this.executions = workflowId ? this.executions.filter((e) => e.workflowId !== workflowId) : [];
    this.#write('executions.json', this.executions);
  }
}

module.exports = { Store };
