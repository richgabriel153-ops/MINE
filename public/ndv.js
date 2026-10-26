'use strict';

// Node details view (Input | Parameters | Output) and the parameter editors.
(function () {
  const Engine = window.FlowEngine;
  const { icon } = window.FlowIcons;

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (k === 'value') e.value = v;
      else if (k === 'checked') e.checked = v;
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }

  const debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  function valueType(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function shortValue(v) {
    if (v === undefined) return '';
    if (v === null) return 'null';
    if (typeof v === 'object') {
      const s = JSON.stringify(v);
      return s.length > 80 ? `${s.slice(0, 80)}…` : s;
    }
    return String(v);
  }

  function docsUrl(type) {
    const name = type.split('.').pop();
    if (type.startsWith('@n8n/')) return `https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.${name.toLowerCase()}/`;
    const def = Engine.NODE_TYPES[type];
    const group = def && def.category === 'app' ? 'app-nodes' : 'core-nodes';
    return `https://docs.n8n.io/integrations/builtin/${group}/n8n-nodes-base.${name.toLowerCase()}/`;
  }

  // An expression that references a field: {{ $json.a.b }} or {{ $('Node').item.json.a }}.
  function fieldExpression(path, nodeName, isDirectParent) {
    const p = path.map((k) => (typeof k === 'number' ? `[${k}]` : /^[A-Za-z_$][\w$]*$/.test(k) ? `.${k}` : `['${String(k).replace(/'/g, "\\'")}']`)).join('');
    return isDirectParent ? `{{ $json${p} }}` : `{{ $('${nodeName}').item.json${p} }}`;
  }

  // ---------------------------------------------------------------------------
  // Data views (schema / table / JSON)
  // ---------------------------------------------------------------------------

  function renderData(items, opts) {
    const { mode = 'table', mapping } = opts;
    if (!items || !items.length) return el('div', { class: 'data-empty' }, 'No items');
    const dragAttrs = (path) => {
      if (!mapping) return {};
      const expr = fieldExpression(path, mapping.nodeName, mapping.direct);
      return {
        draggable: 'true',
        title: `Drag into a parameter, or tap to copy ${expr}`,
        ondragstart: (e) => { e.dataTransfer.setData('text/plain', expr); e.dataTransfer.effectAllowed = 'copy'; document.body.classList.add('mapping'); },
        ondragend: () => document.body.classList.remove('mapping'),
        onclick: (e) => { e.stopPropagation(); mapping.onPick(expr); },
      };
    };

    if (mode === 'json') {
      let text = JSON.stringify(items.map((i) => i.json), null, 2);
      if (text.length > 300000) text = `${text.slice(0, 300000)}\n… (truncated)`;
      return el('pre', { class: 'data-json' }, text);
    }

    if (mode === 'schema') {
      const root = el('div', { class: 'schema' });
      const walk = (obj, path, depth, parent) => {
        for (const [k, v] of Object.entries(obj)) {
          const p = [...path, Array.isArray(obj) ? Number(k) : k];
          const t = valueType(v);
          const row = el('div', { class: 'schema-row', style: `padding-left:${depth * 16}px` },
            el('span', { class: `schema-type t-${t}` }, { string: 'T', number: '#', boolean: '☑', array: '[ ]', object: '{ }', null: '∅' }[t] || '?'),
            el('span', { class: 'schema-key', ...dragAttrs(p) }, Array.isArray(obj) ? `[${k}]` : k),
            t === 'object' || t === 'array' ? null : el('span', { class: 'schema-val' }, shortValue(v)));
          parent.append(row);
          if ((t === 'object' || t === 'array') && depth < 5) walk(t === 'array' ? v.slice(0, 1) : v, p, depth + 1, parent);
        }
      };
      walk(items[0].json, [], 0, root);
      if (!root.childNodes.length) root.append(el('div', { class: 'data-empty' }, 'Item is empty'));
      return root;
    }

    const shown = items.slice(0, 100);
    const cols = [];
    for (const it of shown.slice(0, 30)) for (const k of Object.keys(it.json || {})) if (!cols.includes(k)) cols.push(k);
    if (!cols.length) return el('div', { class: 'data-empty' }, `${items.length} empty item${items.length === 1 ? '' : 's'}`);
    const table = el('table', { class: 'data-table' },
      el('thead', {}, el('tr', {}, el('th', { class: 'rownum' }, '#'), cols.map((c) => el('th', {}, el('span', { class: 'col-key', ...dragAttrs([c]) }, c))))),
      el('tbody', {}, shown.map((it, i) => el('tr', {}, el('td', { class: 'rownum' }, i + 1), cols.map((c) => {
        const v = it.json[c];
        return el('td', { class: `t-${valueType(v)}` }, v === undefined ? '' : shortValue(v));
      })))));
    const wrap = el('div', { class: 'table-wrap' }, table);
    if (items.length > shown.length) wrap.append(el('div', { class: 'muted small pad' }, `Showing ${shown.length} of ${items.length} items`));
    return wrap;
  }

  // ---------------------------------------------------------------------------
  // Parameter editors
  // ---------------------------------------------------------------------------

  // Inserts dropped/mapped text into a field and converts it to an expression.
  function insertAtCursor(input, text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    try { input.setSelectionRange(pos, pos); } catch { /* number inputs */ }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function autoGrow(ta) {
    const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 420)}px`; };
    ta.addEventListener('input', fit);
    requestAnimationFrame(fit);
  }

  class ParamRenderer {
    constructor(ndv) {
      this.ndv = ndv;
      this.lastFocused = null;
    }

    get readOnly() { return this.ndv.readOnly; }

    changed(rerender) {
      this.ndv.app.markDirty();
      if (rerender) this.ndv.renderParams();
    }

    // Text-like input that supports "Fixed | Expression" and {{ }} auto-detection.
    smartInput(get, set, opts = {}) {
      const value = get();
      const isExpr = Engine.isExpression(value);
      const wrap = el('div', { class: 'smart-input' });
      const bind = (input) => {
        input.addEventListener('focus', () => { this.lastFocused = input; });
        input.addEventListener('drop', (e) => {
          const text = e.dataTransfer.getData('text/plain');
          if (!text) return;
          e.preventDefault();
          input.focus();
          insertAtCursor(input, text);
        });
        if (this.readOnly) input.setAttribute('readonly', '');
      };
      if (isExpr) {
        const ta = el('textarea', { class: 'expr-input', rows: 1, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' });
        ta.value = String(value).slice(1);
        autoGrow(ta);
        const result = el('div', { class: 'expr-result' });
        const update = () => {
          const r = this.ndv.app.preview(this.ndv.nodeName, `=${ta.value}`);
          result.classList.toggle('err', !r.ok);
          result.replaceChildren(el('span', { class: 'expr-result-label' }, 'Result'),
            el('span', { class: 'expr-result-value' }, r.ok ? (r.value === '' ? '[empty]' : typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value)) : `[ERROR: ${r.error}]`));
        };
        const debounced = debounce(update, 250);
        ta.addEventListener('input', () => { set(`=${ta.value}`); this.changed(false); debounced(); });
        bind(ta);
        wrap.append(ta, result);
        update();
        wrap.classList.add('is-expr');
        this.lastExprInput = ta;
      } else {
        let input;
        if (opts.type === 'boolean') {
          input = el('input', { type: 'checkbox', class: 'switch-input', checked: Boolean(value), disabled: this.readOnly, onchange: (e) => { set(e.target.checked); this.changed(true); } });
          wrap.append(el('label', { class: 'switch' }, input, el('span', { class: 'slider' })));
          return wrap;
        }
        if (opts.type === 'options') {
          input = el('select', {
            disabled: this.readOnly,
            onchange: (e) => {
              const o = opts.options[e.target.selectedIndex];
              set(o.value);
              if (opts.onOptionChange) opts.onOptionChange();
              this.changed(true);
            },
          }, opts.options.map((o) => el('option', { selected: o.value === value }, o.name)));
          wrap.append(input);
          const current = opts.options.find((o) => o.value === value);
          if (current && current.description) wrap.append(el('div', { class: 'param-hint' }, current.description));
          return wrap;
        }
        const multiline = opts.type === 'json' || opts.type === 'code' || (opts.rows && opts.rows > 1);
        if (multiline) {
          input = el('textarea', { rows: opts.rows || (opts.type === 'code' ? 10 : 4), class: opts.type === 'code' || opts.type === 'json' ? 'code-input' : '', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', placeholder: opts.placeholder || '' });
          input.value = typeof value === 'object' ? JSON.stringify(value, null, 2) : value ?? '';
          if (opts.type === 'code' || opts.type === 'json') {
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); insertAtCursor(input, '  '); }
            });
          } else autoGrow(input);
        } else {
          input = el('input', {
            type: opts.password ? 'password' : opts.type === 'number' ? 'number' : 'text',
            inputmode: opts.type === 'number' ? 'decimal' : undefined,
            placeholder: opts.placeholder || '', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', step: 'any',
          });
          input.value = value ?? '';
        }
        input.addEventListener('input', () => {
          const text = input.value;
          if (opts.type !== 'code' && opts.type !== 'json' && text.includes('{{')) {
            // Typing or dropping {{ switches the field to an expression, like n8n.
            set(`=${text}`);
            this.changed(true);
            requestAnimationFrame(() => { const ta = this.lastExprInput; if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } });
            return;
          }
          set(opts.type === 'number' ? (text === '' ? '' : Number(text)) : text);
          this.changed(false);
        });
        bind(input);
        wrap.append(input);
      }
      return wrap;
    }

    modeToggle(get, set, type) {
      if (this.readOnly || ['notice', 'collection', 'fixedCollection', 'assignmentCollection', 'filter', 'webhookUrls', 'multiOptions', 'code'].includes(type)) return null;
      const isExpr = Engine.isExpression(get());
      const toFixed = () => {
        if (!isExpr) return;
        const raw = String(get()).slice(1);
        const plain = raw.replace(/^\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/, '$1');
        set(type === 'number' ? (Number(plain) || 0) : type === 'boolean' ? plain === 'true' : raw.includes('{{') && plain === raw ? raw : plain);
        this.changed(true);
      };
      const toExpr = () => {
        if (isExpr) return;
        const v = get();
        set(`=${v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : v}`);
        this.changed(true);
      };
      return el('div', { class: 'mode-toggle' },
        el('button', { type: 'button', class: isExpr ? '' : 'on', onclick: toFixed }, 'Fixed'),
        el('button', { type: 'button', class: isExpr ? 'on' : '', onclick: toExpr }, 'Expression'));
    }

    // Renders a list of properties against `values` (mutated in place).
    properties(props, values, root) {
      const frag = document.createDocumentFragment();
      const resolved = Engine.resolveProperties(props, values);
      const rootResolved = root === values ? resolved : root;
      for (const prop of props) {
        if (!Engine.isPropertyVisible(prop, resolved, rootResolved)) continue;
        if (prop.name === 'language' && prop.options && prop.options.length === 1) continue;
        frag.append(this.property(prop, values, props, resolved));
      }
      return frag;
    }

    property(prop, values, siblings, resolved) {
      const get = () => (values[prop.name] !== undefined ? values[prop.name] : Engine.clone(prop.default));
      const set = (v) => { values[prop.name] = v; };
      const type = prop.type;

      if (type === 'notice') return el('div', { class: 'notice' }, prop.displayName);
      if (type === 'webhookUrls') return this.webhookUrls();

      const row = el('div', { class: `param param-${type}` });
      const label = el('div', { class: 'param-label' },
        el('label', {}, prop.displayName, prop.required ? el('span', { class: 'req' }, ' *') : null),
        this.modeToggle(get, set, type));
      if (prop.displayName) row.append(label);

      // When an options value changes, swap values that still hold the default of a now-hidden
      // variant (e.g. Code's jsCode per mode, Date & Time's output field names).
      const onOptionChange = () => {
        const after = Engine.resolveProperties(siblings, values);
        for (const p of siblings) {
          const variants = siblings.filter((x) => x.name === p.name);
          if (variants.length < 2) continue;
          const visible = variants.find((x) => Engine.isPropertyVisible(x, after, after));
          if (visible && variants.some((x) => x !== visible && JSON.stringify(values[p.name]) === JSON.stringify(x.default))) values[p.name] = Engine.clone(visible.default);
        }
      };

      switch (type) {
        case 'string':
        case 'number':
        case 'json':
        case 'code':
        case 'dateTime':
        case 'boolean':
        case 'options':
          row.append(this.smartInput(get, set, {
            type, options: prop.options, placeholder: prop.placeholder, rows: prop.typeOptions && prop.typeOptions.rows,
            password: prop.typeOptions && prop.typeOptions.password, onOptionChange,
          }));
          break;
        case 'multiOptions': {
          const current = get() || [];
          row.append(el('div', { class: 'chips' }, prop.options.map((o) => el('button', {
            type: 'button', class: `chip ${current.includes(o.value) ? 'on' : ''}`, disabled: this.readOnly,
            onclick: () => { const v = get() || []; set(v.includes(o.value) ? v.filter((x) => x !== o.value) : [...v, o.value]); this.changed(true); },
          }, o.name))));
          break;
        }
        case 'collection': row.append(this.collection(prop, values)); break;
        case 'fixedCollection': row.append(this.fixedCollection(prop, values)); break;
        case 'assignmentCollection': row.append(this.assignments(prop, values)); break;
        case 'filter': row.append(this.filter(prop, values)); break;
        default: row.append(el('div', { class: 'muted small' }, `Unsupported parameter type: ${type}`));
      }
      if (prop.description && !['options'].includes(type)) row.append(el('div', { class: 'param-hint' }, prop.description));
      return row;
    }

    collection(prop, values) {
      const value = values[prop.name] && typeof values[prop.name] === 'object' ? values[prop.name] : (values[prop.name] = {});
      const box = el('div', { class: 'collection' });
      const present = prop.options.filter((o) => value[o.name] !== undefined);
      if (!present.length) box.append(el('div', { class: 'muted small' }, 'No properties'));
      for (const o of present) {
        const item = el('div', { class: 'collection-item' }, this.property(o, value, prop.options, value));
        if (!this.readOnly) {
          item.append(el('button', {
            type: 'button', class: 'icon-btn remove', title: 'Delete', 'aria-label': `Delete ${o.displayName}`,
            onclick: () => { delete value[o.name]; this.changed(true); },
          }, icon('trash', 14)));
        }
        box.append(item);
      }
      const missing = prop.options.filter((o) => value[o.name] === undefined);
      if (missing.length && !this.readOnly) {
        const sel = el('select', {
          class: 'add-select',
          onchange: (e) => {
            const o = missing[e.target.selectedIndex - 1];
            if (!o) return;
            value[o.name] = Engine.clone(o.default);
            this.changed(true);
          },
        }, el('option', {}, prop.placeholder || 'Add option'), missing.map((o) => el('option', {}, o.displayName)));
        box.append(sel);
      }
      return box;
    }

    fixedCollection(prop, values) {
      const multiple = prop.typeOptions && prop.typeOptions.multipleValues;
      if (!values[prop.name] || typeof values[prop.name] !== 'object') values[prop.name] = Engine.clone(prop.default) || {};
      const value = values[prop.name];
      const box = el('div', { class: 'fixed-collection' });
      for (const group of prop.options) {
        if (multiple) {
          const entries = Array.isArray(value[group.name]) ? value[group.name] : [];
          entries.forEach((entry, i) => {
            const card = el('div', { class: 'fc-entry' });
            card.append(this.properties(group.values, entry, entry));
            if (!this.readOnly) {
              card.append(el('button', {
                type: 'button', class: 'icon-btn remove', title: 'Delete', 'aria-label': 'Delete',
                onclick: () => { entries.splice(i, 1); if (!entries.length) delete value[group.name]; this.changed(true); },
              }, icon('trash', 14)));
            }
            box.append(card);
          });
        } else if (value[group.name]) {
          const card = el('div', { class: 'fc-entry single' }, el('div', { class: 'fc-title' }, group.displayName));
          card.append(this.properties(group.values, value[group.name], value[group.name]));
          box.append(card);
        }
      }
      if (!this.readOnly) {
        const addable = prop.options.filter((g) => multiple || !value[g.name]);
        const newEntry = (g) => Object.fromEntries(g.values.filter((v) => v.default !== undefined).map((v) => [v.name, Engine.clone(v.default)]));
        if (addable.length === 1) {
          box.append(el('button', {
            type: 'button', class: 'btn btn-secondary btn-block',
            onclick: () => {
              const g = addable[0];
              if (multiple) value[g.name] = [...(value[g.name] || []), newEntry(g)];
              else value[g.name] = newEntry(g);
              this.changed(true);
            },
          }, prop.placeholder || `Add ${addable[0].displayName}`));
        } else if (addable.length > 1) {
          box.append(el('select', {
            class: 'add-select',
            onchange: (e) => {
              const g = addable[e.target.selectedIndex - 1];
              if (!g) return;
              if (multiple) value[g.name] = [...(value[g.name] || []), newEntry(g)];
              else value[g.name] = newEntry(g);
              this.changed(true);
            },
          }, el('option', {}, prop.placeholder || 'Add'), addable.map((g) => el('option', {}, g.displayName))));
        }
      }
      return box;
    }

    assignments(prop, values) {
      if (!values[prop.name] || !Array.isArray(values[prop.name].assignments)) values[prop.name] = { assignments: [] };
      const list = values[prop.name].assignments;
      const box = el('div', { class: 'assignments' });
      if (!list.length) box.append(el('div', { class: 'drop-hint' }, 'Drag input fields here or tap “Add Field”'));
      list.forEach((a, i) => {
        const types = [['string', 'String'], ['number', 'Number'], ['boolean', 'Boolean'], ['array', 'Array'], ['object', 'Object']];
        const row = el('div', { class: 'assignment' },
          el('div', { class: 'assignment-head' },
            el('input', { class: 'assign-name', placeholder: 'name', value: a.name || '', readonly: this.readOnly || undefined, oninput: (e) => { a.name = e.target.value; this.changed(false); } }),
            el('select', { class: 'assign-type', disabled: this.readOnly, onchange: (e) => { a.type = types[e.target.selectedIndex][0]; this.changed(false); } },
              types.map(([v, l]) => el('option', { selected: (a.type || 'string') === v }, l))),
            this.readOnly ? null : el('button', { type: 'button', class: 'icon-btn remove', title: 'Delete', 'aria-label': 'Delete field', onclick: () => { list.splice(i, 1); this.changed(true); } }, icon('trash', 14))),
          this.smartInput(() => a.value ?? '', (v) => { a.value = v; }, { type: 'string', placeholder: 'value' }));
        box.append(row);
      });
      if (!this.readOnly) {
        box.append(el('button', {
          type: 'button', class: 'btn btn-secondary btn-block',
          onclick: () => { list.push({ id: Engine.uuid(), name: '', value: '', type: 'string' }); this.changed(true); },
        }, 'Add Field'));
      }
      // Dropping a field from the input panel creates an assignment for it.
      box.addEventListener('dragover', (e) => e.preventDefault());
      box.addEventListener('drop', (e) => {
        if (e.target.closest('input, textarea')) return;
        const text = e.dataTransfer.getData('text/plain');
        if (!text) return;
        e.preventDefault();
        const m = text.match(/json((?:\.[\w$]+|\[[^\]]+\])+)\s*\}\}$/);
        const name = m ? m[1].replace(/^\./, '').replace(/\[(\d+)\]/g, '.$1').replace(/\['([^']+)'\]/g, '.$1').replace(/^\./, '') : 'field';
        list.push({ id: Engine.uuid(), name, value: `=${text}`, type: 'string' });
        this.changed(true);
      });
      return box;
    }

    filter(prop, values) {
      if (!values[prop.name] || !Array.isArray(values[prop.name].conditions)) {
        const legacy = values[prop.name];
        values[prop.name] = Engine.defaultFilter();
        if (legacy && Object.keys(legacy).length) values[prop.name].conditions = [];
      }
      const f = values[prop.name];
      const box = el('div', { class: 'filter' });
      f.conditions.forEach((c, i) => {
        if (i > 0) {
          box.append(el('div', { class: 'combinator' }, el('select', {
            disabled: this.readOnly || i > 1,
            onchange: (e) => { f.combinator = e.target.value; this.changed(true); },
          }, el('option', { value: 'and', selected: f.combinator !== 'or' }, 'AND'), el('option', { value: 'or', selected: f.combinator === 'or' }, 'OR'))));
        }
        const op = c.operator || { type: 'string', operation: 'equals' };
        const single = Engine.SINGLE_VALUE_OPS.has(op.operation);
        const opSelect = el('select', {
          class: 'op-select', disabled: this.readOnly,
          onchange: (e) => {
            const [type, operation] = e.target.value.split(':');
            c.operator = { type, operation, ...(Engine.SINGLE_VALUE_OPS.has(operation) ? { singleValue: true } : {}) };
            this.changed(true);
          },
        }, Object.entries(Engine.OPERATORS).map(([type, ops]) => el('optgroup', { label: { string: 'String', number: 'Number', dateTime: 'Date & Time', boolean: 'Boolean', array: 'Array', object: 'Object' }[type] },
          ops.map((o) => el('option', { value: `${type}:${o}`, selected: op.type === type && op.operation === o }, `${Engine.OPERATION_LABELS[o]}`)))));
        const row = el('div', { class: 'condition' },
          el('div', { class: 'cond-left' }, this.smartInput(() => c.leftValue ?? '', (v) => { c.leftValue = v; }, { type: 'string', placeholder: 'value1' })),
          el('div', { class: 'cond-op' }, el('span', { class: 'op-type' }, op.type), opSelect),
          single ? null : el('div', { class: 'cond-right' }, this.smartInput(() => c.rightValue ?? '', (v) => { c.rightValue = v; }, { type: 'string', placeholder: 'value2' })),
          this.readOnly ? null : el('button', { type: 'button', class: 'icon-btn remove', title: 'Remove condition', 'aria-label': 'Remove condition', onclick: () => { f.conditions.splice(i, 1); this.changed(true); } }, icon('trash', 14)));
        box.append(row);
      });
      if (!this.readOnly) {
        box.append(el('button', {
          type: 'button', class: 'btn btn-secondary btn-block',
          onclick: () => { f.conditions.push({ id: Engine.uuid(), leftValue: '', rightValue: '', operator: { type: 'string', operation: 'equals' } }); this.changed(true); },
        }, 'Add condition'));
      }
      return box;
    }

    webhookUrls() {
      const node = this.ndv.node;
      const p = Engine.resolveProperties(Engine.NODE_TYPES[node.type].properties, node.parameters);
      const path = Engine.isExpression(p.path) ? '(expression)' : String(p.path || '').replace(/^\/+/, '');
      const base = this.ndv.app.backend.webhookBaseUrl;
      const urls = { test: `${base}/webhook-test/${path}`, production: `${base}/webhook/${path}` };
      let which = this.ndv.webhookTab || 'test';
      const box = el('div', { class: 'webhook-urls' });
      const draw = () => {
        box.replaceChildren(
          el('div', { class: 'wh-tabs' },
            el('button', { type: 'button', class: which === 'test' ? 'on' : '', onclick: () => { which = this.ndv.webhookTab = 'test'; draw(); } }, 'Test URL'),
            el('button', { type: 'button', class: which === 'production' ? 'on' : '', onclick: () => { which = this.ndv.webhookTab = 'production'; draw(); } }, 'Production URL')),
          el('div', { class: 'wh-url' },
            el('span', { class: 'method' }, p.httpMethod || 'GET'),
            el('code', {}, urls[which]),
            el('button', { type: 'button', class: 'icon-btn', title: 'Copy URL', 'aria-label': 'Copy URL', onclick: () => this.ndv.app.copy(urls[which], 'Webhook URL copied') }, icon('copy', 14))),
          el('div', { class: 'param-hint' }, which === 'test'
            ? 'Click "Listen for test event", then call this URL. The workflow runs once with the call’s data.'
            : this.ndv.app.backend.local
              ? 'In the preview, webhooks can’t be called from outside. Deploy Flowlite to get a working URL.'
              : 'Activate the workflow (toggle at the top) and calls to this URL will run it.'));
      };
      draw();
      return el('div', { class: 'param' }, el('div', { class: 'param-label' }, el('label', {}, 'Webhook URLs')), box);
    }
  }

  // ---------------------------------------------------------------------------
  // NDV
  // ---------------------------------------------------------------------------

  class NDV {
    constructor(app, nodeName, { readOnly = false } = {}) {
      this.app = app;
      this.nodeName = nodeName;
      this.readOnly = readOnly;
      this.tab = 'params';
      this.mobileTab = 'params';
      this.inputMode = 'schema';
      this.outputMode = 'table';
      this.outputIndex = 0;
      this.inputNode = null;
      this.renderer = new ParamRenderer(this);
      this.root = el('div', { class: 'ndv-backdrop', onmousedown: (e) => { if (e.target === this.root) this.close(); } });
      this.onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) this.close(); };
      document.addEventListener('keydown', this.onKey);
      this.render();
    }

    get node() { return this.app.workflow().nodes.find((n) => n.name === this.nodeName); }
    get def() { return Engine.NODE_TYPES[this.node.type]; }

    close() {
      document.removeEventListener('keydown', this.onKey);
      this.root.remove();
      this.app.onNdvClosed(this);
    }

    runData() {
      const ex = this.app.execution();
      return (ex && ex.runData) || {};
    }

    render() {
      const node = this.node;
      if (!node) return this.close();
      const isTrigger = Engine.isTriggerNode(node);
      this.panels = {
        input: el('section', { class: 'ndv-panel ndv-input' }),
        params: el('section', { class: 'ndv-panel ndv-params' }),
        output: el('section', { class: 'ndv-panel ndv-output' }),
      };
      const tabs = el('div', { class: 'ndv-mobile-tabs', role: 'tablist' },
        [['input', 'Input'], ['params', 'Parameters'], ['output', 'Output']].filter(([k]) => !(k === 'input' && isTrigger))
          .map(([k, label]) => el('button', { type: 'button', role: 'tab', class: this.mobileTab === k ? 'on' : '', onclick: () => { this.mobileTab = k; this.render(); } }, label)));
      const box = el('div', { class: `ndv ${isTrigger ? 'no-input' : ''} show-${this.mobileTab}` },
        el('div', { class: 'ndv-top' },
          el('button', { type: 'button', class: 'back-link', onclick: () => this.close() }, icon('chevronLeft', 16), el('span', { class: 'hide-mobile' }, 'Back to canvas'), el('span', { class: 'show-mobile' }, node.name)),
          tabs),
        el('div', { class: 'ndv-body' }, isTrigger ? null : this.panels.input, this.panels.params, this.panels.output));
      this.root.replaceChildren(box);
      if (!this.root.isConnected) document.body.append(this.root);
      if (!isTrigger) this.renderInput();
      this.renderParams();
      this.renderOutput();
    }

    refresh() {
      if (!this.node) return this.close();
      if (!Engine.isTriggerNode(this.node)) this.renderInput();
      this.renderOutput();
      this.renderParams();
    }

    testButton() {
      const node = this.node;
      const isWebhook = node.type === 'n8n-nodes-base.webhook';
      const listening = this.app.isListening();
      const running = this.app.isRunning();
      if (this.readOnly) return null;
      if (isWebhook) {
        return el('button', { type: 'button', class: 'btn btn-primary', onclick: () => (listening ? this.app.stopListening() : this.app.listen(node.name)) },
          icon(listening ? 'x' : 'flask', 15), listening ? 'Stop listening' : 'Listen for test event');
      }
      return el('button', { type: 'button', class: 'btn btn-primary', disabled: running, onclick: () => this.app.runNode(node.name) },
        icon(running ? 'loader' : 'flask', 15, running ? 'spin' : ''), running ? 'Executing…' : 'Test step');
    }

    renderParams() {
      const node = this.node;
      const def = this.def;
      const panel = this.panels.params;
      const scrollTop = panel.querySelector('.params-scroll') ? panel.querySelector('.params-scroll').scrollTop : 0;
      const nameEl = el('h2', { class: 'ndv-name', title: this.readOnly ? '' : 'Rename' }, node.name);
      if (!this.readOnly) {
        nameEl.addEventListener('click', () => {
          const input = el('input', { class: 'rename-input', value: node.name });
          const commit = () => {
            try {
              this.nodeName = this.app.renameNode(node.name, input.value);
            } catch (err) {
              this.app.toast('error', 'Could not rename node', err.message);
            }
            this.render();
          };
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') this.render(); });
          input.addEventListener('blur', commit);
          nameEl.replaceWith(input);
          input.focus();
          input.select();
        });
      }
      const ico = icon(def ? def.icon : 'unknown', 22);
      ico.style.color = def ? def.color : 'var(--muted)';
      const header = el('div', { class: 'params-header' }, el('div', { class: 'params-title' }, ico, nameEl), this.testButton());
      const subtabs = el('div', { class: 'subtabs' },
        el('button', { type: 'button', class: this.tab === 'params' ? 'on' : '', onclick: () => { this.tab = 'params'; this.renderParams(); } }, 'Parameters'),
        el('button', { type: 'button', class: this.tab === 'settings' ? 'on' : '', onclick: () => { this.tab = 'settings'; this.renderParams(); } }, 'Settings'),
        el('a', { class: 'docs-link', href: docsUrl(node.type), target: '_blank', rel: 'noopener' }, icon('book', 13), 'Docs'));
      const body = el('div', { class: 'params-scroll' });
      if (!def) {
        body.append(el('div', { class: 'notice warn' }, `This node type (${node.type}) isn’t supported in Flowlite yet. It will be skipped with an error when the workflow runs. You can still delete or keep it.`),
          el('pre', { class: 'data-json' }, JSON.stringify(node.parameters, null, 2)));
      } else if (this.tab === 'settings') {
        body.append(this.settings());
      } else {
        if (node.disabled) body.append(el('div', { class: 'notice warn' }, 'This node is deactivated and will pass data through without running.'));
        body.append(this.credentialSection(), this.renderer.properties(def.properties, node.parameters, node.parameters));
      }
      panel.replaceChildren(header, subtabs, body);
      body.scrollTop = scrollTop;
    }

    credentialSection() {
      const node = this.node;
      const def = this.def;
      const resolved = Engine.resolveProperties(def.properties, node.parameters);
      const types = (def.credentials || []).filter((c) => Engine.isPropertyVisible(c, resolved, resolved));
      const frag = document.createDocumentFragment();
      for (const ct of types) {
        const ctype = Engine.CREDENTIAL_TYPES[ct.name];
        const available = this.app.credentials().filter((c) => c.type === ct.name);
        const current = node.credentials && node.credentials[ct.name];
        const select = el('select', {
          disabled: this.readOnly,
          onchange: (e) => {
            const idx = e.target.selectedIndex;
            if (idx === available.length + 1) {
              e.target.selectedIndex = current ? available.findIndex((c) => c.id === current.id) + 1 : 0;
              this.app.openCredential({ type: ct.name, onSaved: (c) => { node.credentials = { ...(node.credentials || {}), [ct.name]: { id: c.id, name: c.name } }; this.app.markDirty(); this.renderParams(); } });
              return;
            }
            const c = available[idx - 1];
            node.credentials = { ...(node.credentials || {}) };
            if (c) node.credentials[ct.name] = { id: c.id, name: c.name };
            else delete node.credentials[ct.name];
            this.app.markDirty();
            this.renderParams();
          },
        }, el('option', {}, 'Select Credential'),
        available.map((c) => el('option', { selected: current && (current.id === c.id || (!current.id && current.name === c.name)) }, c.name)),
        el('option', {}, '+ Create new credential'));
        const selected = current && available.find((c) => c.id === current.id);
        frag.append(el('div', { class: 'param credential-param' },
          el('div', { class: 'param-label' }, el('label', {}, `Credential to connect with`)),
          el('div', { class: 'cred-row' }, select,
            selected && !this.readOnly ? el('button', { type: 'button', class: 'icon-btn', title: 'Edit credential', 'aria-label': 'Edit credential', onclick: () => this.app.openCredential({ id: selected.id, onSaved: () => this.renderParams() }) }, icon('pen', 14)) : null),
          current && !selected ? el('div', { class: 'param-hint err-text' }, `Credential “${current.name}” isn’t set up here yet. Select or create one.`) : null,
          !available.length ? el('div', { class: 'param-hint' }, `You need a ${ctype ? ctype.displayName : ct.name} credential.`) : null));
      }
      return frag;
    }

    settings() {
      const node = this.node;
      const ro = this.readOnly;
      const toggle = (key, label, hint) => el('div', { class: 'param' },
        el('div', { class: 'param-label' }, el('label', {}, label)),
        el('label', { class: 'switch' }, el('input', { type: 'checkbox', class: 'switch-input', checked: Boolean(node[key]), disabled: ro, onchange: (e) => { if (e.target.checked) node[key] = true; else delete node[key]; this.app.markDirty(); } }), el('span', { class: 'slider' })),
        el('div', { class: 'param-hint' }, hint));
      const onError = node.onError || (node.continueOnFail ? 'continueRegularOutput' : 'stopWorkflow');
      const notes = el('textarea', { rows: 3, readonly: ro || undefined, oninput: (e) => { node.notes = e.target.value; this.app.markDirty(); } });
      notes.value = node.notes || '';
      return el('div', {},
        toggle('alwaysOutputData', 'Always Output Data', 'If active, will output a single, empty item when the output would have been empty. Use to prevent the workflow finishing on this node.'),
        toggle('executeOnce', 'Execute Once', 'If active, the node executes only once, with data from the first item it receives'),
        el('div', { class: 'param' },
          el('div', { class: 'param-label' }, el('label', {}, 'On Error')),
          el('select', { disabled: ro, onchange: (e) => { node.onError = ['stopWorkflow', 'continueRegularOutput'][e.target.selectedIndex]; delete node.continueOnFail; this.app.markDirty(); } },
            el('option', { selected: onError === 'stopWorkflow' }, 'Stop Workflow'),
            el('option', { selected: onError !== 'stopWorkflow' }, 'Continue')),
          el('div', { class: 'param-hint' }, 'Action to take when the node execution fails')),
        el('div', { class: 'param' }, el('div', { class: 'param-label' }, el('label', {}, 'Notes')), notes, el('div', { class: 'param-hint' }, 'Optional note to save with the node')),
        toggle('notesInFlow', 'Display Note in Flow?', 'If active, the note above will display in the flow as a subtitle'),
        el('div', { class: 'muted small pad' }, `Node type: ${node.type} (v${node.typeVersion || 1})`));
    }

    // ----- input / output -----

    inputCandidates() {
      const wf = this.app.workflow();
      const parents = Engine.parentsOf(wf, this.nodeName);
      const seen = new Set();
      const out = [];
      const queue = parents.map((p) => p.node);
      while (queue.length) {
        const n = queue.shift();
        if (seen.has(n)) continue;
        seen.add(n);
        out.push(n);
        Engine.parentsOf(wf, n).forEach((p) => queue.push(p.node));
      }
      return { parents, list: out };
    }

    dataToolbar(mode, setMode, extra) {
      return el('div', { class: 'data-toolbar' }, extra,
        el('div', { class: 'seg' }, ['schema', 'table', 'json'].map((m) => el('button', { type: 'button', class: mode === m ? 'on' : '', onclick: () => setMode(m) }, m[0].toUpperCase() + m.slice(1)))));
    }

    renderInput() {
      const panel = this.panels.input;
      const { parents, list } = this.inputCandidates();
      if (!list.length) {
        panel.replaceChildren(el('div', { class: 'panel-title' }, 'Input'),
          el('div', { class: 'panel-empty' }, el('strong', {}, 'No input connected'), el('p', {}, 'Connect a node to this one to pass it data.')));
        return;
      }
      if (!this.inputNode || !list.includes(this.inputNode)) this.inputNode = list[0];
      const runData = this.runData();
      const runs = runData[this.inputNode];
      const run = runs && runs[runs.length - 1];
      const parentLink = parents.find((p) => p.node === this.inputNode);
      const outIndex = parentLink ? parentLink.outputIndex : 0;
      const items = run && run.data && run.data[outIndex];
      const select = el('select', { class: 'input-select', onchange: (e) => { this.inputNode = list[e.target.selectedIndex]; this.renderInput(); } },
        list.map((n) => el('option', { selected: n === this.inputNode }, n)));
      const head = el('div', { class: 'panel-head' }, el('div', { class: 'panel-title' }, 'Input'), select,
        items ? el('span', { class: 'count' }, `${items.length} item${items.length === 1 ? '' : 's'}`) : null);
      let body;
      if (!run) {
        body = el('div', { class: 'panel-empty' }, el('strong', {}, 'No input data yet'),
          this.readOnly ? null : el('button', { type: 'button', class: 'btn btn-secondary', disabled: this.app.isRunning(), onclick: () => this.app.runNode(this.inputNode) }, 'Execute previous nodes'),
          el('p', { class: 'muted small' }, '(From the earliest node that has no output data yet)'));
      } else if (run.executionStatus === 'error') {
        body = el('div', { class: 'panel-empty' }, el('strong', {}, `“${this.inputNode}” failed`), el('p', {}, run.error.message));
      } else {
        const mapping = this.readOnly ? null : {
          nodeName: this.inputNode, direct: Boolean(parentLink) && parents.length === 1,
          onPick: (expr) => {
            const target = this.renderer.lastFocused;
            if (target && target.isConnected) {
              insertAtCursor(target, expr);
              this.app.toast('success', 'Mapped field', expr);
            } else this.app.copy(expr, `Copied ${expr}`);
          },
        };
        body = el('div', { class: 'panel-data' },
          this.dataToolbar(this.inputMode, (m) => { this.inputMode = m; this.renderInput(); }),
          renderData(items || [], { mode: this.inputMode, mapping }),
          mapping ? el('div', { class: 'muted small pad' }, 'Drag a field into a parameter to map it. On touch screens, tap a parameter, then tap the field.') : null);
      }
      panel.replaceChildren(head, body);
    }

    renderOutput() {
      const panel = this.panels.output;
      const runs = this.runData()[this.nodeName];
      const run = runs && runs[runs.length - 1];
      const outputs = Engine.getOutputNames(this.node);
      if (this.outputIndex >= outputs.length) this.outputIndex = 0;
      const items = run && run.data && run.data[this.outputIndex];
      const head = el('div', { class: 'panel-head' }, el('div', { class: 'panel-title' }, 'Output'),
        run && run.executionStatus !== 'error' ? el('span', { class: 'count' }, `${items ? items.length : 0} item${items && items.length === 1 ? '' : 's'}`) : null,
        runs && runs.length > 1 ? el('span', { class: 'muted small' }, `Run ${runs.length} of ${runs.length}`) : null);
      let body;
      if (this.app.isRunning() && this.app.runningNodes().has(this.nodeName)) {
        body = el('div', { class: 'panel-empty' }, icon('loader', 24, 'spin'), el('strong', {}, 'Executing node…'));
      } else if (this.app.isListening() && this.node.type === 'n8n-nodes-base.webhook') {
        body = el('div', { class: 'panel-empty listening' }, icon('webhook', 28), el('strong', {}, 'Listening for test event'),
          el('p', {}, 'Make a request to the Test URL. The workflow will run once with that request.'),
          el('code', { class: 'break' }, this.app.webhookTestUrl(this.node)));
      } else if (!run) {
        body = el('div', { class: 'panel-empty' }, el('strong', {}, 'No output data'),
          this.readOnly ? null : el('p', {}, 'Execute this node to view data, or ',
            el('button', { type: 'button', class: 'link', onclick: () => this.app.runNode(this.nodeName) }, 'test step'), '.'));
      } else if (run.executionStatus === 'error') {
        body = el('div', { class: 'panel-error' }, el('div', { class: 'err-title' }, icon('alert', 16), 'Problem in node ‘', this.nodeName, '‘'),
          el('div', { class: 'err-msg' }, run.error.message),
          run.error.description ? el('div', { class: 'err-desc' }, run.error.description) : null);
      } else {
        const outTabs = outputs.length > 1 ? el('div', { class: 'seg output-tabs' }, outputs.map((name, k) => el('button', {
          type: 'button', class: this.outputIndex === k ? 'on' : '', onclick: () => { this.outputIndex = k; this.renderOutput(); },
        }, `${name === 'main' ? 'Output' : name} (${(run.data[k] || []).length})`))) : null;
        body = el('div', { class: 'panel-data' },
          this.dataToolbar(this.outputMode, (m) => { this.outputMode = m; this.renderOutput(); }, outTabs),
          items && items.length ? renderData(items, { mode: this.outputMode }) : el('div', { class: 'panel-empty' }, el('strong', {}, 'No output data'), el('p', {}, 'This node ran but returned no items on this branch.')),
          run.truncated ? el('div', { class: 'muted small pad' }, 'Only the first 100 items were stored.') : null,
          run.logs && run.logs.length ? el('div', { class: 'console' }, el('div', { class: 'console-title' }, 'Console'), el('pre', {}, run.logs.join('\n'))) : null);
      }
      panel.replaceChildren(head, body);
    }
  }

  window.FlowNDV = { NDV, renderData, ParamRenderer };
})();
