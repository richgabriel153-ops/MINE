'use strict';

// The workflow canvas (nodes, connections, pan/zoom) and helpers that edit the workflow graph.
(function () {
  const Engine = window.FlowEngine;
  const { icon } = window.FlowIcons;
  const NODE_W = 100;
  const GRID = 20;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 2.5;

  function el(tag, cls, ...children) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }

  // ---------------------------------------------------------------------------
  // Graph editing
  // ---------------------------------------------------------------------------

  const Graph = {
    uniqueName(workflow, base) {
      const names = new Set(workflow.nodes.map((n) => n.name));
      if (!names.has(base)) return base;
      const stem = base.replace(/\d+$/, '');
      for (let i = 1; ; i++) if (!names.has(`${stem}${i}`)) return `${stem}${i}`;
    },

    addNode(workflow, type, position) {
      const def = Engine.NODE_TYPES[type];
      const node = {
        parameters: Engine.newNodeParameters(type),
        id: Engine.uuid(),
        name: Graph.uniqueName(workflow, def.name),
        type,
        typeVersion: def.version,
        position: [Math.round(position[0] / GRID) * GRID, Math.round(position[1] / GRID) * GRID],
      };
      if (type === 'n8n-nodes-base.webhook') node.webhookId = node.parameters.path;
      workflow.nodes.push(node);
      return node;
    },

    outputsOf(workflow, name) {
      workflow.connections[name] = workflow.connections[name] || { main: [] };
      workflow.connections[name].main = workflow.connections[name].main || [];
      return workflow.connections[name].main;
    },

    connect(workflow, from, out, to, inIndex = 0) {
      if (from === to) return false;
      const outputs = Graph.outputsOf(workflow, from);
      while (outputs.length <= out) outputs.push([]);
      outputs[out] = outputs[out] || [];
      if (outputs[out].some((c) => c.node === to && (c.index || 0) === inIndex)) return false;
      outputs[out].push({ node: to, type: 'main', index: inIndex });
      return true;
    },

    disconnect(workflow, from, out, to, inIndex = 0) {
      const outputs = (workflow.connections[from] && workflow.connections[from].main) || [];
      if (!outputs[out]) return;
      outputs[out] = outputs[out].filter((c) => !(c.node === to && (c.index || 0) === inIndex));
      Graph.cleanup(workflow);
    },

    cleanup(workflow) {
      for (const [name, conns] of Object.entries(workflow.connections)) {
        const main = (conns.main || []).map((l) => l || []);
        while (main.length && !main[main.length - 1].length) main.pop();
        if (!main.length) delete workflow.connections[name];
        else conns.main = main;
      }
    },

    // Removes a node. Like n8n, a node with a single parent and children is "healed":
    // its parent is reconnected to its children.
    removeNode(workflow, name) {
      const parents = Engine.parentsOf(workflow, name);
      const children = ((workflow.connections[name] && workflow.connections[name].main) || [])[0] || [];
      workflow.nodes = workflow.nodes.filter((n) => n.name !== name);
      delete workflow.connections[name];
      for (const conns of Object.values(workflow.connections)) {
        conns.main = (conns.main || []).map((list) => (list || []).filter((c) => c.node !== name));
      }
      if (parents.length === 1) for (const c of children) Graph.connect(workflow, parents[0].node, parents[0].outputIndex, c.node, c.index || 0);
      Graph.cleanup(workflow);
    },

    renameNode(workflow, oldName, newName) {
      newName = String(newName || '').trim();
      if (!newName || newName === oldName) return oldName;
      if (workflow.nodes.some((n) => n.name === newName)) throw new Error(`There is already a node called "${newName}"`);
      const node = workflow.nodes.find((n) => n.name === oldName);
      node.name = newName;
      if (workflow.connections[oldName]) {
        workflow.connections[newName] = workflow.connections[oldName];
        delete workflow.connections[oldName];
      }
      for (const conns of Object.values(workflow.connections)) for (const list of conns.main || []) for (const c of list || []) if (c.node === oldName) c.node = newName;
      // Update expressions that reference the node, e.g. $('Old') and $node["Old"].
      const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(\\$\\(\\s*['"\`]|\\$node\\[\\s*['"\`]|\\$items\\(\\s*['"\`])${esc}(['"\`])`, 'g');
      for (const n of workflow.nodes) n.parameters = JSON.parse(JSON.stringify(n.parameters).replace(re, (_, a, b) => `${a}${newName.replace(/"/g, '\\"')}${b}`));
      if (workflow.pinData && workflow.pinData[oldName]) {
        workflow.pinData[newName] = workflow.pinData[oldName];
        delete workflow.pinData[oldName];
      }
      return newName;
    },

    // Adds nodes from pasted/imported n8n JSON, renaming any that clash.
    importNodes(workflow, data, offset) {
      const nodes = Array.isArray(data.nodes) ? data.nodes : [];
      const rename = {};
      const minX = Math.min(...nodes.map((n) => (n.position ? n.position[0] : 0)));
      const minY = Math.min(...nodes.map((n) => (n.position ? n.position[1] : 0)));
      const added = [];
      for (const n of nodes) {
        if (!n || !n.type || !n.name) continue;
        const copy = Engine.clone(n);
        copy.id = Engine.uuid();
        copy.name = Graph.uniqueName(workflow, n.name);
        rename[n.name] = copy.name;
        copy.parameters = copy.parameters || {};
        const p = copy.position || [0, 0];
        copy.position = offset ? [p[0] - minX + offset[0], p[1] - minY + offset[1]] : p;
        workflow.nodes.push(copy);
        added.push(copy);
      }
      for (const [from, conns] of Object.entries(data.connections || {})) {
        if (!rename[from]) continue;
        ((conns && conns.main) || []).forEach((list, out) => (list || []).forEach((c) => {
          if (rename[c.node]) Graph.connect(workflow, rename[from], out, rename[c.node], c.index || 0);
        }));
      }
      return added;
    },
  };

  // ---------------------------------------------------------------------------
  // Canvas
  // ---------------------------------------------------------------------------

  function nodeHeight(node) {
    const outs = Engine.getOutputNames(node).length;
    const ins = Engine.getInputNames(node).length;
    return Math.max(NODE_W, Math.max(outs, ins) * 32 + 16);
  }

  function handleY(index, count, height) {
    return (height * (index + 1)) / (count + 1);
  }

  function edgePath(x1, y1, x2, y2) {
    if (x2 >= x1 + 30) {
      const dx = Math.max(40, (x2 - x1) / 2);
      return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    }
    // Backwards connection: loop below the nodes.
    const drop = Math.max(y1, y2) + 80;
    return `M${x1},${y1} C${x1 + 80},${y1} ${x1 + 80},${drop} ${(x1 + x2) / 2},${drop} S${x2 - 80},${y2} ${x2},${y2}`;
  }

  class Canvas {
    constructor(opts) {
      this.opts = opts;
      this.view = { x: 0, y: 0, zoom: 1 };
      this.selected = null;
      this.pointers = new Map();
      this.drag = null;
      this.root = el('div', 'canvas');
      this.root.tabIndex = 0;
      this.layer = el('div', 'canvas-layer');
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.classList.add('edges');
      this.nodesLayer = el('div', 'canvas-nodes');
      this.edgeBar = el('div', 'edge-toolbar');
      this.edgeBar.hidden = true;
      this.layer.append(this.svg, this.nodesLayer, this.edgeBar);
      this.root.append(this.layer);
      this.root.addEventListener('pointerdown', (e) => this.onDown(e));
      this.root.addEventListener('pointermove', (e) => this.onMove(e));
      this.root.addEventListener('pointerup', (e) => this.onUp(e));
      this.root.addEventListener('pointercancel', (e) => this.onUp(e, true));
      this.root.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
      this.root.addEventListener('keydown', (e) => this.onKey(e));
      this.root.addEventListener('mouseover', (e) => {
        const hit = e.target.closest && e.target.closest('.edge-hit');
        if (hit && !this.drag && !this.opts.readOnly) this.showEdgeBar(JSON.parse(hit.dataset.edge));
        else if (!e.target.closest('.edge-toolbar') && !(this.selected && this.selected.kind === 'edge')) this.edgeBar.hidden = true;
      });
    }

    get workflow() { return this.opts.getWorkflow(); }

    nodeByName(name) { return this.workflow.nodes.find((n) => n.name === name); }

    // ----- view -----

    applyView() {
      const { x, y, zoom } = this.view;
      this.layer.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
      this.root.style.backgroundSize = `${GRID * zoom}px ${GRID * zoom}px`;
      this.root.style.backgroundPosition = `${x}px ${y}px`;
      if (this.opts.onViewChange) this.opts.onViewChange(this.view);
    }

    zoomAt(factor, cx, cy) {
      const rect = this.root.getBoundingClientRect();
      if (cx === undefined) { cx = rect.width / 2; cy = rect.height / 2; }
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.zoom * factor));
      const k = zoom / this.view.zoom;
      this.view = { zoom, x: cx - (cx - this.view.x) * k, y: cy - (cy - this.view.y) * k };
      this.applyView();
    }

    resetZoom() { this.zoomAt(1 / this.view.zoom); }

    fitView() {
      const nodes = this.workflow.nodes;
      const rect = this.root.getBoundingClientRect();
      if (!rect.width) return;
      if (!nodes.length) {
        this.view = { x: rect.width / 2, y: rect.height / 2, zoom: 1 };
        return this.applyView();
      }
      const xs = nodes.map((n) => n.position[0]);
      const ys = nodes.map((n) => n.position[1]);
      const minX = Math.min(...xs) - 60, maxX = Math.max(...nodes.map((n) => n.position[0] + NODE_W)) + 60;
      const minY = Math.min(...ys) - 50, maxY = Math.max(...nodes.map((n) => n.position[1] + nodeHeight(n))) + 70;
      const bottomPad = this.opts.bottomPadding || 0;
      const zoom = Math.min(1.1, Math.max(MIN_ZOOM, Math.min(rect.width / (maxX - minX), (rect.height - bottomPad) / (maxY - minY))));
      this.view = {
        zoom,
        x: rect.width / 2 - ((minX + maxX) / 2) * zoom,
        y: (rect.height - bottomPad) / 2 - ((minY + maxY) / 2) * zoom,
      };
      this.applyView();
    }

    toCanvas(clientX, clientY) {
      const rect = this.root.getBoundingClientRect();
      return [(clientX - rect.left - this.view.x) / this.view.zoom, (clientY - rect.top - this.view.y) / this.view.zoom];
    }

    // A free spot for a new node: right of the selected/last node, or the viewport centre.
    centerPosition() {
      const rect = this.root.getBoundingClientRect();
      const [x, y] = this.toCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return [x - NODE_W / 2, y - NODE_W / 2];
    }

    // ----- rendering -----

    render() {
      const wf = this.workflow;
      const runData = (this.opts.getRunData && this.opts.getRunData()) || {};
      const running = (this.opts.getRunning && this.opts.getRunning()) || new Set();
      const frag = document.createDocumentFragment();
      for (const node of wf.nodes) frag.append(this.renderNode(node, runData, running));
      this.nodesLayer.replaceChildren(frag);
      this.renderEdges(runData);
      if (this.selected && this.selected.kind === 'edge') this.showEdgeBar(this.selected.edge);
      else this.edgeBar.hidden = true;
      this.applyView();
      if (this.opts.onRender) this.opts.onRender();
    }

    renderNode(node, runData, running) {
      const def = Engine.NODE_TYPES[node.type];
      const isTrigger = Engine.isTriggerNode(node);
      const height = nodeHeight(node);
      const runs = runData[node.name];
      const run = runs && runs[runs.length - 1];
      const status = running.has(node.name) ? 'running' : run ? (run.executionStatus === 'error' ? 'error' : 'success') : '';
      const selected = this.selected && this.selected.kind === 'node' && this.selected.name === node.name;

      const box = el('div', `node ${isTrigger ? 'trigger' : ''} ${node.disabled ? 'disabled' : ''} ${status} ${selected ? 'selected' : ''} ${def ? '' : 'unknown'}`);
      box.style.height = `${height}px`;
      const ico = icon(def ? def.icon : 'unknown', 40, 'node-icon');
      ico.style.color = def ? def.color : 'var(--muted)';
      box.append(ico);
      if (isTrigger) box.append(el('span', 'trigger-mark', icon('zap', 14)));
      if (status === 'success') {
        const count = (run.data || []).reduce((s, o) => s + (o ? o.length : 0), 0);
        box.append(el('span', 'node-status ok', icon('check', 14), runs.length > 1 ? `${runs.length}` : null));
        box.title = `${count} item${count === 1 ? '' : 's'}`;
      }
      if (status === 'error') box.append(el('span', 'node-status err', icon('alert', 16)));
      if (status === 'running') box.append(el('span', 'node-status spin', icon('loader', 20)));
      if (node.disabled) box.append(el('span', 'disabled-strike'));
      if (this.opts.pinned && this.opts.pinned(node.name)) box.append(el('span', 'node-pin', 'pinned'));

      const wrap = el('div', 'node-wrap');
      wrap.dataset.name = node.name;
      wrap.style.left = `${node.position[0]}px`;
      wrap.style.top = `${node.position[1]}px`;
      wrap.append(box);

      // Handles
      const inputs = Engine.getInputNames(node);
      inputs.forEach((label, k) => {
        const hnd = el('div', 'handle in');
        hnd.style.top = `${handleY(k, inputs.length, height)}px`;
        hnd.dataset.index = k;
        if (inputs.length > 1) hnd.append(el('span', 'handle-label in', label));
        wrap.append(hnd);
      });
      const outputs = Engine.getOutputNames(node);
      const conns = (this.workflow.connections[node.name] && this.workflow.connections[node.name].main) || [];
      outputs.forEach((label, k) => {
        const hnd = el('div', 'handle out');
        hnd.style.top = `${handleY(k, outputs.length, height)}px`;
        hnd.dataset.index = k;
        if (outputs.length > 1 || (label !== 'main' && outputs.length > 1)) hnd.append(el('span', 'handle-label out', label));
        if (!this.opts.readOnly && !(conns[k] && conns[k].length)) {
          const plus = el('button', 'plus', icon('plus', 14));
          plus.type = 'button';
          plus.dataset.index = k;
          plus.setAttribute('aria-label', 'Add node');
          const line = el('span', 'plus-line');
          if (outputs.length > 1) { line.classList.add('long'); plus.classList.add('long'); }
          hnd.append(line, plus);
        }
        wrap.append(hnd);
      });

      // Label
      const label = el('div', 'node-label');
      label.style.top = `${height + 8}px`;
      label.append(el('div', 'node-name', node.name, node.disabled ? el('span', 'muted', ' (Deactivated)') : null));
      const sub = Engine.nodeSubtitle(node);
      if (sub) label.append(el('div', 'node-sub', sub));
      if (node.notesInFlow && node.notes) label.append(el('div', 'node-note', node.notes));
      if (!def) label.append(el('div', 'node-sub err-text', 'Not supported'));
      wrap.append(label);

      // Toolbar (shown on hover / when selected)
      if (!this.opts.readOnly) {
        const bar = el('div', 'node-toolbar');
        const btn = (name, title, fn) => {
          const b = el('button', '', icon(name, 15));
          b.type = 'button';
          b.title = title;
          b.setAttribute('aria-label', title);
          b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
          return b;
        };
        bar.append(
          btn('play', 'Test step', () => this.opts.onRunNode(node.name)),
          btn('power', node.disabled ? 'Activate' : 'Deactivate', () => this.toggleDisable(node.name)),
          btn('trash', 'Delete', () => this.deleteNode(node.name)),
          btn('pen', 'Open', () => this.opts.onOpenNode(node.name)),
        );
        wrap.append(bar);
      }
      if (selected) wrap.classList.add('is-selected');
      return wrap;
    }

    handlePoint(node, kind, index) {
      const h = nodeHeight(node);
      const names = kind === 'in' ? Engine.getInputNames(node) : Engine.getOutputNames(node);
      return [node.position[0] + (kind === 'in' ? 0 : NODE_W), node.position[1] + handleY(index, names.length, h)];
    }

    renderEdges(runData) {
      const ns = 'http://www.w3.org/2000/svg';
      const wf = this.workflow;
      const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
      const frag = document.createDocumentFragment();
      for (const [from, conns] of Object.entries(wf.connections || {})) {
        const src = byName[from];
        if (!src) continue;
        ((conns && conns.main) || []).forEach((list, out) => (list || []).forEach((c) => {
          const dst = byName[c.node];
          if (!dst) return;
          const [x1, y1] = this.handlePoint(src, 'out', out);
          const [x2, y2] = this.handlePoint(dst, 'in', c.index || 0);
          const d = edgePath(x1, y1, x2, y2);
          const runs = runData[from];
          const run = runs && runs[runs.length - 1];
          const count = run && run.executionStatus !== 'error' && run.data && run.data[out] ? run.data[out].length : null;
          const edge = { from, out, to: c.node, in: c.index || 0 };
          const selected = this.selected && this.selected.kind === 'edge' && JSON.stringify(this.selected.edge) === JSON.stringify(edge);
          const path = document.createElementNS(ns, 'path');
          path.setAttribute('d', d);
          path.setAttribute('class', `edge ${count ? 'has-data' : ''} ${selected ? 'selected' : ''}`);
          const hit = document.createElementNS(ns, 'path');
          hit.setAttribute('d', d);
          hit.setAttribute('class', 'edge-hit');
          hit.dataset.edge = JSON.stringify(edge);
          frag.append(path, hit);
          if (count) {
            const t = document.createElementNS(ns, 'text');
            t.setAttribute('x', (x1 + x2) / 2);
            t.setAttribute('y', (y1 + y2) / 2 - 8);
            t.setAttribute('class', 'edge-label');
            t.textContent = `${count} item${count === 1 ? '' : 's'}`;
            frag.append(t);
          }
        }));
      }
      if (this.drag && this.drag.mode === 'connect' && this.drag.moved) {
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', edgePath(this.drag.x1, this.drag.y1, this.drag.x2, this.drag.y2));
        p.setAttribute('class', 'edge temp');
        frag.append(p);
      }
      this.svg.replaceChildren(frag);
    }

    showEdgeBar(edge) {
      const src = this.nodeByName(edge.from);
      const dst = this.nodeByName(edge.to);
      if (!src || !dst) { this.edgeBar.hidden = true; return; }
      const [x1, y1] = this.handlePoint(src, 'out', edge.out);
      const [x2, y2] = this.handlePoint(dst, 'in', edge.in);
      const bar = this.edgeBar;
      bar.style.left = `${(x1 + x2) / 2}px`;
      bar.style.top = `${(y1 + y2) / 2}px`;
      const add = el('button', '', icon('plus', 14));
      add.type = 'button';
      add.title = 'Add node';
      add.addEventListener('click', (e) => { e.stopPropagation(); this.opts.onAddNode({ insert: edge, position: [(x1 + x2) / 2 - NODE_W / 2, (y1 + y2) / 2 - NODE_W / 2] }); });
      const del = el('button', '', icon('trash', 14));
      del.type = 'button';
      del.title = 'Delete connection';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        Graph.disconnect(this.workflow, edge.from, edge.out, edge.to, edge.in);
        this.selected = null;
        this.opts.onChange();
      });
      bar.replaceChildren(add, del);
      bar.hidden = false;
    }

    // ----- editing -----

    // Updates selection styling in place (re-rendering would replace the node elements and
    // break double-click, whose two clicks must land on the same element).
    select(sel) {
      this.selected = sel;
      const name = sel && sel.kind === 'node' ? sel.name : null;
      for (const wrap of this.nodesLayer.children) {
        const on = wrap.dataset.name === name;
        wrap.classList.toggle('is-selected', on);
        wrap.firstChild.classList.toggle('selected', on);
      }
      this.renderEdges((this.opts.getRunData && this.opts.getRunData()) || {});
      if (sel && sel.kind === 'edge') this.showEdgeBar(sel.edge);
      else this.edgeBar.hidden = true;
      if (this.opts.onSelect) this.opts.onSelect(sel);
    }

    deleteNode(name) {
      Graph.removeNode(this.workflow, name);
      this.selected = null;
      this.opts.onChange();
    }

    toggleDisable(name) {
      const node = this.nodeByName(name);
      if (!node) return;
      if (node.disabled) delete node.disabled;
      else node.disabled = true;
      this.opts.onChange();
    }

    // ----- input -----

    onDown(e) {
      if (e.target.closest('.node-toolbar button, .edge-toolbar button')) return;
      this.root.focus({ preventScroll: true });
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { this.root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.drag = { mode: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.view.zoom, view: { ...this.view } };
        return;
      }
      const start = { sx: e.clientX, sy: e.clientY, moved: false, pointerType: e.pointerType };
      const outHandle = !this.opts.readOnly && e.target.closest('.handle.out, .plus');
      const wrap = e.target.closest('.node-wrap');
      const edgeHit = e.target.closest('.edge-hit');
      if (outHandle && wrap) {
        const node = this.nodeByName(wrap.dataset.name);
        const index = Number((outHandle.closest('.handle.out') || outHandle).dataset.index || outHandle.dataset.index || 0);
        const [x1, y1] = this.handlePoint(node, 'out', index);
        this.drag = { ...start, mode: 'connect', from: node.name, out: index, x1, y1, x2: x1, y2: y1 };
      } else if (wrap) {
        const node = this.nodeByName(wrap.dataset.name);
        this.drag = { ...start, mode: 'node', name: node.name, orig: [...node.position], wrap };
      } else if (edgeHit) {
        this.drag = { ...start, mode: 'edge', edge: JSON.parse(edgeHit.dataset.edge) };
      } else {
        this.drag = { ...start, mode: 'pan', view: { ...this.view } };
      }
    }

    onMove(e) {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = this.drag;
      if (!d) return;
      if (d.mode === 'pinch') {
        if (this.pointers.size < 2) return;
        const [a, b] = [...this.pointers.values()];
        const rect = this.root.getBoundingClientRect();
        const cx = (a.x + b.x) / 2 - rect.left;
        const cy = (a.y + b.y) / 2 - rect.top;
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, d.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / d.dist)));
        const k = zoom / this.view.zoom;
        this.view = { zoom, x: cx - (cx - this.view.x) * k, y: cy - (cy - this.view.y) * k };
        this.applyView();
        return;
      }
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < (d.pointerType === 'touch' ? 8 : 4)) return;
      d.moved = true;
      if (d.mode === 'pan') {
        this.view = { ...this.view, x: d.view.x + dx, y: d.view.y + dy };
        this.applyView();
      } else if (d.mode === 'node' && !this.opts.readOnly) {
        const node = this.nodeByName(d.name);
        node.position = [
          Math.round((d.orig[0] + dx / this.view.zoom) / GRID) * GRID,
          Math.round((d.orig[1] + dy / this.view.zoom) / GRID) * GRID,
        ];
        d.wrap.style.left = `${node.position[0]}px`;
        d.wrap.style.top = `${node.position[1]}px`;
        d.wrap.classList.add('dragging');
        this.renderEdges((this.opts.getRunData && this.opts.getRunData()) || {});
        this.edgeBar.hidden = true;
      } else if (d.mode === 'connect') {
        [d.x2, d.y2] = this.toCanvas(e.clientX, e.clientY);
        const over = document.elementFromPoint(e.clientX, e.clientY);
        const target = over && over.closest('.node-wrap');
        this.nodesLayer.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
        if (target && target.dataset.name !== d.from) target.classList.add('drop-target');
        this.renderEdges((this.opts.getRunData && this.opts.getRunData()) || {});
      }
    }

    onUp(e, cancelled) {
      this.pointers.delete(e.pointerId);
      const d = this.drag;
      if (!d) return;
      if (d.mode === 'pinch') {
        if (!this.pointers.size) this.drag = null;
        return;
      }
      this.drag = null;
      if (cancelled) return this.render();
      if (d.mode === 'node') {
        if (d.moved) this.opts.onChange();
        else {
          // Open on double-click (mouse) or on tapping an already-selected node (touch). Detected
          // here because pointer capture sends the browser's dblclick to the canvas, not the node.
          const already = this.selected && this.selected.kind === 'node' && this.selected.name === d.name;
          const now = Date.now();
          const double = this.lastClick && this.lastClick.name === d.name && now - this.lastClick.at < 450;
          this.lastClick = { name: d.name, at: now };
          if (double || (already && d.pointerType !== 'mouse')) {
            this.lastClick = null;
            this.opts.onOpenNode(d.name);
          } else this.select({ kind: 'node', name: d.name });
        }
      } else if (d.mode === 'connect') {
        this.nodesLayer.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
        const over = document.elementFromPoint(e.clientX, e.clientY);
        const target = over && over.closest('.node-wrap');
        if (target && target.dataset.name !== d.from) {
          const dst = this.nodeByName(target.dataset.name);
          const inputs = Engine.getInputNames(dst);
          if (inputs.length) {
            const [, y] = this.toCanvas(e.clientX, e.clientY);
            const h = nodeHeight(dst);
            let best = 0;
            inputs.forEach((_, k) => { if (Math.abs(dst.position[1] + handleY(k, inputs.length, h) - y) < Math.abs(dst.position[1] + handleY(best, inputs.length, h) - y)) best = k; });
            Graph.connect(this.workflow, d.from, d.out, dst.name, best);
            this.opts.onChange();
            return;
          }
        }
        if (!d.moved) this.opts.onAddNode({ source: { node: d.from, output: d.out } });
        else {
          const [x, y] = this.toCanvas(e.clientX, e.clientY);
          this.opts.onAddNode({ source: { node: d.from, output: d.out }, position: [x, y - NODE_W / 2] });
        }
        this.render();
      } else if (d.mode === 'edge') {
        if (!d.moved) this.select({ kind: 'edge', edge: d.edge });
      } else if (d.mode === 'pan' && !d.moved && this.selected) {
        this.select(null);
      }
    }

    onWheel(e) {
      e.preventDefault();
      const rect = this.root.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) this.zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
      else {
        this.view = { ...this.view, x: this.view.x - e.deltaX, y: this.view.y - e.deltaY };
        this.applyView();
      }
    }

    onKey(e) {
      if (this.opts.readOnly || e.target !== this.root) return;
      const sel = this.selected;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault();
        if (sel.kind === 'node') this.deleteNode(sel.name);
        else {
          Graph.disconnect(this.workflow, sel.edge.from, sel.edge.out, sel.edge.to, sel.edge.in);
          this.selected = null;
          this.opts.onChange();
        }
      } else if (e.key === 'Enter' && sel && sel.kind === 'node') this.opts.onOpenNode(sel.name);
      else if (e.key === 'd' && sel && sel.kind === 'node' && !e.metaKey && !e.ctrlKey) this.toggleDisable(sel.name);
      else if (e.key === '1' && !e.metaKey && !e.ctrlKey) this.fitView();
      else if (e.key === '+' || e.key === '=') this.zoomAt(1.2);
      else if (e.key === '-') this.zoomAt(1 / 1.2);
      else if (e.key === '0') this.resetZoom();
      else if (e.key === 'Tab') { e.preventDefault(); this.opts.onAddNode({}); }
    }
  }

  window.FlowCanvas = { Canvas, Graph, nodeHeight, NODE_W };
})();
