/* Flowlite workflow engine.
 *
 * Shared by the server (require) and the browser (window.FlowEngine). Workflows use n8n's JSON
 * format: { nodes: [{ name, type, typeVersion, position, parameters, credentials }],
 * connections: { [nodeName]: { main: [[{ node, type, index }], ...] } } }.
 * Items flow between nodes as arrays of { json } objects, and parameter values that start with
 * "=" are expressions where {{ ... }} is evaluated with $json, $input, $('Node'), $now, ...
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlowEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  function uuid() {
    if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function splitPath(path) {
    const parts = [];
    String(path).replace(/[^.[\]]+|\[(\d+)\]/g, (m, idx) => parts.push(idx !== undefined ? Number(idx) : m));
    return parts;
  }

  function getPath(obj, path) {
    if (path === undefined || path === null || path === '') return obj;
    let cur = obj;
    for (const key of splitPath(path)) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[key];
    }
    return cur;
  }

  function setPath(obj, path, value) {
    const parts = splitPath(path);
    let cur = obj;
    parts.forEach((key, i) => {
      if (i === parts.length - 1) cur[key] = value;
      else {
        if (!isObject(cur[key]) && !Array.isArray(cur[key])) cur[key] = typeof parts[i + 1] === 'number' ? [] : {};
        cur = cur[key];
      }
    });
    return obj;
  }

  function unwrapLocator(v) {
    return isObject(v) && v.__rl ? v.value : v;
  }

  function isEmptyValue(v) {
    if (v === undefined || v === null || v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (isObject(v)) return Object.keys(v).length === 0;
    return false;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  class NodeError extends Error {
    constructor(message, description) {
      super(message);
      this.description = description;
    }
  }

  // ---------------------------------------------------------------------------
  // DateTime: a small subset of Luxon's DateTime, which n8n exposes as $now / $today.
  // ---------------------------------------------------------------------------

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const UNIT_MS = { millisecond: 1, second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5 };
  const pad = (n, w = 2) => String(Math.trunc(Math.abs(n))).padStart(w, '0');
  const normUnit = (u) => String(u || 'milliseconds').replace(/s$/, '');

  class DateTime {
    constructor(ms) {
      this.ts = ms;
    }
    static now() { return new DateTime(Date.now()); }
    static fromISO(s) { return new DateTime(Date.parse(s)); }
    static fromMillis(n) { return new DateTime(Number(n)); }
    static fromSeconds(n) { return new DateTime(Number(n) * 1000); }
    static fromJSDate(d) { return new DateTime(d.getTime()); }
    static from(v) {
      if (v instanceof DateTime) return v;
      if (v instanceof Date) return DateTime.fromJSDate(v);
      if (typeof v === 'number') return new DateTime(v < 1e11 ? v * 1000 : v);
      if (typeof v === 'string' && /^\d+$/.test(v.trim())) return DateTime.from(Number(v));
      return DateTime.fromISO(v);
    }
    get d() { return new Date(this.ts); }
    get isValid() { return !Number.isNaN(this.ts); }
    get year() { return this.d.getFullYear(); }
    get month() { return this.d.getMonth() + 1; }
    get day() { return this.d.getDate(); }
    get hour() { return this.d.getHours(); }
    get minute() { return this.d.getMinutes(); }
    get second() { return this.d.getSeconds(); }
    get millisecond() { return this.d.getMilliseconds(); }
    get weekday() { return this.d.getDay() || 7; }
    get weekdayLong() { return WEEKDAYS[this.d.getDay()]; }
    get monthLong() { return MONTHS[this.d.getMonth()]; }
    get weekNumber() {
      const d = new Date(Date.UTC(this.year, this.month - 1, this.day));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil(((d - yearStart) / 864e5 + 1) / 7);
    }
    toJSDate() { return this.d; }
    toMillis() { return this.ts; }
    toSeconds() { return this.ts / 1000; }
    toUnixInteger() { return Math.floor(this.ts / 1000); }
    valueOf() { return this.ts; }
    toISO() {
      if (!this.isValid) return null;
      const d = this.d;
      const off = -d.getTimezoneOffset();
      const tz = off === 0 ? 'Z' : `${off > 0 ? '+' : '-'}${pad(off / 60)}:${pad(off % 60)}`;
      return `${this.toISODate()}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${tz}`;
    }
    toISODate() { return `${this.year}-${pad(this.month)}-${pad(this.day)}`; }
    toString() { return this.toISO(); }
    toJSON() { return this.toISO(); }
    toLocaleString(opts) { return this.d.toLocaleString(undefined, opts); }
    toFormat(fmt) {
      const d = this.d;
      const h12 = d.getHours() % 12 || 12;
      const map = {
        yyyy: this.year, yy: pad(this.year % 100), MMMM: this.monthLong, MMM: this.monthLong.slice(0, 3),
        LLLL: this.monthLong, LLL: this.monthLong.slice(0, 3), MM: pad(this.month), LL: pad(this.month), M: this.month, L: this.month,
        dd: pad(this.day), d: this.day, EEEE: this.weekdayLong, EEE: this.weekdayLong.slice(0, 3), E: this.weekday,
        cccc: this.weekdayLong, ccc: this.weekdayLong.slice(0, 3), HH: pad(this.hour), H: this.hour, hh: pad(h12), h: h12,
        mm: pad(this.minute), m: this.minute, ss: pad(this.second), s: this.second, SSS: pad(this.millisecond, 3),
        a: this.hour < 12 ? 'AM' : 'PM', X: this.toUnixInteger(), x: this.ts, WW: pad(this.weekNumber), W: this.weekNumber,
      };
      return String(fmt).replace(/'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|LLLL|LLL|LL|L|dd|d|EEEE|EEE|E|cccc|ccc|HH|H|hh|h|mm|m|ss|s|SSS|a|X|x|WW|W/g,
        (tok, lit) => (lit !== undefined ? lit : String(map[tok])));
    }
    plus(dur, unit) {
      if (typeof dur === 'number') dur = { [normUnit(unit)]: dur };
      const d = this.d;
      for (const [k, v] of Object.entries(dur || {})) {
        const u = normUnit(k);
        const months = u === 'year' ? 12 * v : u === 'quarter' ? 3 * v : u === 'month' ? v : 0;
        if (months) {
          // Clamp to the last day of the target month, like Luxon (Jan 31 + 1 month = Feb 28/29).
          const day = d.getDate();
          d.setDate(1);
          d.setMonth(d.getMonth() + months);
          d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
        } else if (UNIT_MS[u]) d.setTime(d.getTime() + v * UNIT_MS[u]);
      }
      return new DateTime(d.getTime());
    }
    minus(dur, unit) {
      if (typeof dur === 'number') return this.plus(-dur, unit);
      const neg = {};
      for (const [k, v] of Object.entries(dur || {})) neg[k] = -v;
      return this.plus(neg);
    }
    startOf(unit) {
      const d = this.d;
      const u = normUnit(unit);
      if (u === 'year') d.setMonth(0, 1);
      if (u === 'month' || u === 'year') d.setDate(u === 'month' ? 1 : d.getDate());
      if (u === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      if (['year', 'month', 'week', 'day'].includes(u)) d.setHours(0, 0, 0, 0);
      if (u === 'hour') d.setMinutes(0, 0, 0);
      if (u === 'minute') d.setSeconds(0, 0);
      return new DateTime(d.getTime());
    }
    endOf(unit) {
      const u = normUnit(unit);
      return this.startOf(u).plus(1, u).minus(1, 'millisecond');
    }
    set(values) {
      const d = this.d;
      if (values.year !== undefined) d.setFullYear(values.year);
      if (values.month !== undefined) d.setMonth(values.month - 1);
      if (values.day !== undefined) d.setDate(values.day);
      if (values.hour !== undefined) d.setHours(values.hour);
      if (values.minute !== undefined) d.setMinutes(values.minute);
      if (values.second !== undefined) d.setSeconds(values.second);
      return new DateTime(d.getTime());
    }
    diff(other, unit = 'milliseconds') {
      const ms = this.ts - DateTime.from(other).ts;
      const as = (u) => {
        u = normUnit(u);
        if (u === 'month') return ms / (UNIT_MS.day * 30.4375);
        if (u === 'year') return ms / (UNIT_MS.day * 365.25);
        return ms / (UNIT_MS[u] || 1);
      };
      return { milliseconds: ms, as, [`${normUnit(unit)}s`]: as(unit), toMillis: () => ms };
    }
    equals(o) { return this.ts === DateTime.from(o).ts; }
    hasSame(o, unit) { return this.startOf(unit).ts === DateTime.from(o).startOf(unit).ts; }
  }

  // ---------------------------------------------------------------------------
  // Expressions
  // ---------------------------------------------------------------------------

  const fnCache = new Map();

  // Default evaluator. The server replaces it with a node:vm version that has a timeout.
  function defaultEvaluate(code, ctx) {
    const keys = Object.keys(ctx);
    const cacheKey = keys.join(',') + '\u0000' + code;
    let fn = fnCache.get(cacheKey);
    if (!fn) {
      fn = new Function(...keys, `"use strict";\nreturn (${code}\n);`);
      if (fnCache.size > 2000) fnCache.clear();
      fnCache.set(cacheKey, fn);
    }
    return fn(...keys.map((k) => ctx[k]));
  }

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  function defaultRunCode(code, ctx, thisArg) {
    const keys = Object.keys(ctx);
    const fn = new AsyncFunction(...keys, `"use strict";\n${code}`);
    return fn.apply(thisArg, keys.map((k) => ctx[k]));
  }

  const isExpression = (v) => typeof v === 'string' && v.charAt(0) === '=';
  const EXPR_RE = /\{\{([\s\S]*?)\}\}/g;

  function stringifyValue(v) {
    if (v === undefined || v === null) return '';
    if (v instanceof DateTime) return v.toISO();
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function evaluateExpression(value, ctx, evaluate) {
    const body = value.slice(1);
    const run = (code) => {
      if (!code.trim()) return '';
      try {
        return evaluate(code, ctx);
      } catch (err) {
        throw new NodeError(`${err.message} [line 1]`, `There was an error in the expression {{${code}}}`);
      }
    };
    const whole = body.match(/^\s*\{\{([\s\S]*?)\}\}\s*$/);
    if (whole && !whole[1].includes('{{')) {
      const v = run(whole[1]);
      return v instanceof DateTime ? v.toISO() : v;
    }
    return body.replace(EXPR_RE, (_, code) => stringifyValue(run(code)));
  }

  function resolveDeep(value, ctx, evaluate) {
    if (isExpression(value)) return evaluateExpression(value, ctx, evaluate);
    if (Array.isArray(value)) return value.map((v) => resolveDeep(v, ctx, evaluate));
    if (isObject(value)) {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = resolveDeep(v, ctx, evaluate);
      return out;
    }
    return value;
  }

  // ---------------------------------------------------------------------------
  // Conditions (the "filter" parameter used by IF, Filter and Switch)
  // ---------------------------------------------------------------------------

  const OPERATORS = {
    string: ['exists', 'notExists', 'empty', 'notEmpty', 'equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'notStartsWith', 'endsWith', 'notEndsWith', 'regex', 'notRegex'],
    number: ['exists', 'notExists', 'empty', 'notEmpty', 'equals', 'notEquals', 'gt', 'lt', 'gte', 'lte'],
    dateTime: ['exists', 'notExists', 'empty', 'notEmpty', 'equals', 'notEquals', 'after', 'before', 'afterOrEquals', 'beforeOrEquals'],
    boolean: ['exists', 'notExists', 'empty', 'notEmpty', 'true', 'false', 'equals', 'notEquals'],
    array: ['exists', 'notExists', 'empty', 'notEmpty', 'contains', 'notContains', 'lengthEquals', 'lengthNotEquals', 'lengthGt', 'lengthLt', 'lengthGte', 'lengthLte'],
    object: ['exists', 'notExists', 'empty', 'notEmpty'],
  };
  const OPERATION_LABELS = {
    exists: 'exists', notExists: 'does not exist', empty: 'is empty', notEmpty: 'is not empty', equals: 'is equal to',
    notEquals: 'is not equal to', contains: 'contains', notContains: 'does not contain', startsWith: 'starts with',
    notStartsWith: 'does not start with', endsWith: 'ends with', notEndsWith: 'does not end with', regex: 'matches regex',
    notRegex: 'does not match regex', gt: 'is greater than', lt: 'is less than', gte: 'is greater than or equal to',
    lte: 'is less than or equal to', after: 'is after', before: 'is before', afterOrEquals: 'is after or equal to',
    beforeOrEquals: 'is before or equal to', true: 'is true', false: 'is false', lengthEquals: 'length equal to',
    lengthNotEquals: 'length not equal to', lengthGt: 'length greater than', lengthLt: 'length less than',
    lengthGte: 'length greater than or equal to', lengthLte: 'length less than or equal to',
  };
  const SINGLE_VALUE_OPS = new Set(['exists', 'notExists', 'empty', 'notEmpty', 'true', 'false']);

  function toBool(v) {
    if (typeof v === 'string') return ['true', '1', 'yes'].includes(v.trim().toLowerCase());
    return Boolean(v);
  }

  function evaluateCondition(cond, caseSensitive) {
    const { type = 'string', operation = 'equals' } = cond.operator || {};
    let left = cond.leftValue;
    let right = cond.rightValue;
    if (operation === 'exists') return left !== undefined && left !== null;
    if (operation === 'notExists') return left === undefined || left === null;
    if (operation === 'empty') return isEmptyValue(left);
    if (operation === 'notEmpty') return !isEmptyValue(left);

    if (type === 'string') {
      left = stringifyValue(left);
      right = stringifyValue(right);
      if (!caseSensitive && !operation.includes('egex')) {
        left = left.toLowerCase();
        right = right.toLowerCase();
      }
      switch (operation) {
        case 'equals': return left === right;
        case 'notEquals': return left !== right;
        case 'contains': return left.includes(right);
        case 'notContains': return !left.includes(right);
        case 'startsWith': return left.startsWith(right);
        case 'notStartsWith': return !left.startsWith(right);
        case 'endsWith': return left.endsWith(right);
        case 'notEndsWith': return !left.endsWith(right);
        case 'regex':
        case 'notRegex': {
          const m = right.match(/^\/(.*)\/([gimsuy]*)$/s);
          const re = m ? new RegExp(m[1], m[2]) : new RegExp(right, caseSensitive ? '' : 'i');
          return operation === 'regex' ? re.test(left) : !re.test(left);
        }
      }
    }
    if (type === 'number') {
      const l = Number(left);
      const r = Number(right);
      switch (operation) {
        case 'equals': return l === r;
        case 'notEquals': return l !== r;
        case 'gt': return l > r;
        case 'lt': return l < r;
        case 'gte': return l >= r;
        case 'lte': return l <= r;
      }
    }
    if (type === 'dateTime') {
      const l = DateTime.from(left).ts;
      const r = DateTime.from(right).ts;
      switch (operation) {
        case 'equals': return l === r;
        case 'notEquals': return l !== r;
        case 'after': return l > r;
        case 'before': return l < r;
        case 'afterOrEquals': return l >= r;
        case 'beforeOrEquals': return l <= r;
      }
    }
    if (type === 'boolean') {
      switch (operation) {
        case 'true': return toBool(left) === true;
        case 'false': return toBool(left) === false;
        case 'equals': return toBool(left) === toBool(right);
        case 'notEquals': return toBool(left) !== toBool(right);
      }
    }
    if (type === 'array') {
      if (typeof left === 'string') {
        try { left = JSON.parse(left); } catch { /* not an array */ }
      }
      if (!Array.isArray(left)) left = left === undefined || left === null ? [] : [left];
      const n = Number(right);
      switch (operation) {
        case 'contains': return left.some((v) => (isObject(v) ? JSON.stringify(v) === stringifyValue(right) : String(v) === String(right)));
        case 'notContains': return !left.some((v) => String(v) === String(right));
        case 'lengthEquals': return left.length === n;
        case 'lengthNotEquals': return left.length !== n;
        case 'lengthGt': return left.length > n;
        case 'lengthLt': return left.length < n;
        case 'lengthGte': return left.length >= n;
        case 'lengthLte': return left.length <= n;
      }
    }
    throw new NodeError(`Unsupported comparison: ${type} ${operation}`);
  }

  // Converts IF v1 style conditions ({ string: [...], number: [...], boolean: [...] }).
  function legacyConditions(c, combine) {
    const opMap = {
      equal: 'equals', notEqual: 'notEquals', smaller: 'lt', smallerEqual: 'lte', larger: 'gt', largerEqual: 'gte',
      isEmpty: 'empty', isNotEmpty: 'notEmpty', contains: 'contains', notContains: 'notContains', startsWith: 'startsWith',
      notStartsWith: 'notStartsWith', endsWith: 'endsWith', notEndsWith: 'notEndsWith', regex: 'regex', notRegex: 'notRegex',
      before: 'before', after: 'after',
    };
    const conditions = [];
    for (const type of ['string', 'number', 'boolean', 'dateTime']) {
      for (const x of c[type] || []) {
        conditions.push({ leftValue: x.value1, rightValue: x.value2, operator: { type, operation: opMap[x.operation || 'equal'] || 'equals' } });
      }
    }
    return { conditions, combinator: combine === 'any' ? 'or' : 'and', options: { caseSensitive: true } };
  }

  function evaluateFilter(filter, combineOperation) {
    if (!filter) return true;
    if (!Array.isArray(filter.conditions)) filter = legacyConditions(filter, combineOperation);
    const caseSensitive = !filter.options || filter.options.caseSensitive !== false;
    const results = filter.conditions.map((c) => evaluateCondition(c, caseSensitive));
    if (!results.length) return true;
    return filter.combinator === 'or' ? results.some(Boolean) : results.every(Boolean);
  }

  function defaultFilter(operation = 'equals') {
    return {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ id: uuid(), leftValue: '', rightValue: '', operator: { type: 'string', operation } }],
      combinator: 'and',
    };
  }

  // ---------------------------------------------------------------------------
  // Hashing (MD5 is not in Web Crypto, so it is implemented here)
  // ---------------------------------------------------------------------------

  function md5(bytes) {
    const K = new Int32Array(64);
    const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0;
    const len = bytes.length;
    const nBlocks = ((len + 8) >> 6) + 1;
    const w = new Int32Array(nBlocks * 16);
    for (let i = 0; i < len; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
    w[len >> 2] |= 0x80 << ((len % 4) * 8);
    w[nBlocks * 16 - 2] = (len * 8) | 0;
    w[nBlocks * 16 - 1] = Math.floor(len / 0x20000000);
    let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
    for (let blk = 0; blk < w.length; blk += 16) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        const s = S[(i >> 4) * 4 + (i % 4)];
        const sum = (A + F + K[i] + w[blk + g]) | 0;
        A = D; D = C; C = B;
        B = (B + ((sum << s) | (sum >>> (32 - s)))) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const out = new Uint8Array(16);
    [a0, b0, c0, d0].forEach((v, i) => { for (let j = 0; j < 4; j++) out[i * 4 + j] = (v >>> (j * 8)) & 255; });
    return out;
  }

  const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const encodeBytes = (bytes, encoding) => (encoding === 'base64' ? toBase64(bytes) : toHex(bytes));
  const SUBTLE_ALGOS = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512' };

  async function hashValue(type, value) {
    const bytes = new TextEncoder().encode(String(value));
    if (type === 'MD5') return md5(bytes);
    return new Uint8Array(await globalThis.crypto.subtle.digest(SUBTLE_ALGOS[type], bytes));
  }

  async function hmacValue(type, value, secret) {
    const enc = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: SUBTLE_ALGOS[type] }, false, ['sign']);
    return new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(String(value))));
  }

  // ---------------------------------------------------------------------------
  // Schedules
  // ---------------------------------------------------------------------------

  const CRON_NAMES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

  function cronFieldMatches(field, value, min, max) {
    return field.split(',').some((part) => {
      const [range, stepStr] = part.split('/');
      const step = stepStr ? Number(stepStr) : 1;
      let lo, hi;
      const num = (s) => (CRON_NAMES[s.toLowerCase()] !== undefined ? CRON_NAMES[s.toLowerCase()] : Number(s));
      if (range === '*' || range === '?') { lo = min; hi = max; }
      else if (range.includes('-')) { [lo, hi] = range.split('-').map(num); }
      else { lo = num(range); hi = stepStr ? max : lo; }
      for (let v = lo; v <= hi; v += step) if (v === value || (max === 7 && v === 7 && value === 0)) return true;
      return false;
    });
  }

  function cronMatches(expr, date) {
    let f = String(expr || '').trim().split(/\s+/);
    if (f.length === 6) f = f.slice(1); // n8n allows a leading seconds field
    if (f.length !== 5) return false;
    const vals = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()];
    const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
    const ok = f.map((field, i) => cronFieldMatches(field, vals[i], ranges[i][0], ranges[i][1]));
    const domRestricted = !['*', '?'].includes(f[2]);
    const dowRestricted = !['*', '?'].includes(f[4]);
    const dayOk = domRestricted && dowRestricted ? ok[2] || ok[4] : ok[2] && ok[4];
    return ok[0] && ok[1] && ok[3] && dayOk;
  }

  // True when a Schedule Trigger node should fire in the minute containing `date`.
  function isScheduleDue(parameters, date) {
    const intervals = (parameters && parameters.rule && parameters.rule.interval) || [{}];
    return intervals.some((r) => {
      const field = r.field || 'days';
      const atHour = r.triggerAtHour !== undefined ? Number(r.triggerAtHour) : 0;
      const atMinute = r.triggerAtMinute !== undefined ? Number(r.triggerAtMinute) : 0;
      const atTime = date.getHours() === atHour && date.getMinutes() === atMinute;
      switch (field) {
        case 'seconds': return true;
        case 'minutes': {
          const n = Number(r.minutesInterval) || 5;
          return n < 60 ? date.getMinutes() % n === 0 : (date.getHours() * 60 + date.getMinutes()) % n === 0;
        }
        case 'hours': return date.getMinutes() === atMinute && date.getHours() % (Number(r.hoursInterval) || 1) === 0;
        case 'days': return atTime && (date.getDate() - 1) % (Number(r.daysInterval) || 1) === 0;
        case 'weeks': {
          const days = (r.triggerAtDay && r.triggerAtDay.length ? r.triggerAtDay : [0]).map(Number);
          return atTime && days.includes(date.getDay());
        }
        case 'months': return atTime && date.getDate() === (Number(r.triggerAtDayOfMonth) || 1) && date.getMonth() % (Number(r.monthsInterval) || 1) === 0;
        case 'cronExpression': return cronMatches(r.expression, date);
        default: return false;
      }
    });
  }

  function describeSchedule(parameters) {
    const r = ((parameters && parameters.rule && parameters.rule.interval) || [{}])[0] || {};
    const hm = `${pad(r.triggerAtHour || 0)}:${pad(r.triggerAtMinute || 0)}`;
    switch (r.field || 'days') {
      case 'seconds': return 'Every minute';
      case 'minutes': return `Every ${r.minutesInterval || 5} minutes`;
      case 'hours': return `Every ${r.hoursInterval || 1} hour(s) at :${pad(r.triggerAtMinute || 0)}`;
      case 'days': return `Every ${(r.daysInterval || 1) > 1 ? `${r.daysInterval} days` : 'day'} at ${hm}`;
      case 'weeks': return `Weekly at ${hm}`;
      case 'months': return `Monthly at ${hm}`;
      case 'cronExpression': return `Cron: ${r.expression || ''}`;
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // Parameter helpers shared by the engine and the editor UI
  // ---------------------------------------------------------------------------

  // n8n's displayOptions: { show: { param: [values] }, hide: {...} }. Keys starting with "/" look at
  // the node's root parameters; other keys look at sibling values.
  function isPropertyVisible(prop, values, rootValues) {
    const dop = prop.displayOptions;
    if (!dop) return true;
    const get = (key) => {
      const v = key.startsWith('/') ? getPath(rootValues, key.slice(1)) : values[key];
      return v;
    };
    if (dop.show) {
      for (const [key, allowed] of Object.entries(dop.show)) {
        const v = get(key);
        if (!allowed.some((a) => a === v || (Array.isArray(v) && v.includes(a)))) return false;
      }
    }
    if (dop.hide) {
      for (const [key, hidden] of Object.entries(dop.hide)) {
        if (hidden.includes(get(key))) return false;
      }
    }
    return true;
  }

  // Fills in defaults for visible properties that are missing (n8n omits defaults when exporting).
  function withDefaults(properties, values, rootValues) {
    const out = { ...(values || {}) };
    const root = rootValues || out;
    for (const prop of properties) {
      if (['notice', 'webhookUrls'].includes(prop.type)) continue;
      if (!isPropertyVisible(prop, out, root === out ? out : root)) continue;
      if (out[prop.name] === undefined && prop.default !== undefined) out[prop.name] = clone(prop.default);
    }
    return out;
  }

  function resolveProperties(properties, values) {
    // Some properties exist twice with different displayOptions (e.g. Code's jsCode per mode);
    // fill defaults twice so dependent properties see their controlling values.
    return withDefaults(properties, withDefaults(properties, values));
  }

  function newNodeParameters(type) {
    const def = NODE_TYPES[type];
    if (!def) return {};
    const params = resolveProperties(def.properties, {});
    if (def.onCreate) def.onCreate(params);
    return params;
  }

  // ---------------------------------------------------------------------------
  // Node definitions
  // ---------------------------------------------------------------------------

  const opt = (name, value, description) => ({ name, value, description });
  const kv = (name, displayName, extra = {}) => ({
    name, displayName, type: 'fixedCollection', typeOptions: { multipleValues: true }, placeholder: 'Add Parameter',
    default: { parameters: [{ name: '', value: '' }] },
    options: [{ name: 'parameters', displayName: 'Parameter', values: [
      { name: 'name', displayName: 'Name', type: 'string', default: '' },
      { name: 'value', displayName: 'Value', type: 'string', default: '' },
    ] }],
    ...extra,
  });

  function pairsToObject(collection, key = 'parameters') {
    const out = {};
    for (const p of (collection && collection[key]) || []) if (p.name !== undefined && p.name !== '') out[p.name] = p.value;
    return out;
  }

  function parseJsonParam(value, label) {
    if (isObject(value) || Array.isArray(value)) return value;
    if (value === undefined || value === null || String(value).trim() === '') return {};
    try {
      return JSON.parse(value);
    } catch (err) {
      throw new NodeError(`${label} is not valid JSON`, err.message);
    }
  }

  function readableDate(d) {
    const dt = DateTime.fromJSDate(d);
    return {
      timestamp: dt.toISO(),
      'Readable date': dt.toFormat('MMMM d yyyy, h:mm:ss a'),
      'Readable time': dt.toFormat('h:mm:ss a'),
      'Day of week': dt.weekdayLong,
      Year: String(dt.year),
      Month: dt.monthLong,
      'Day of month': pad(dt.day),
      Hour: pad(dt.hour),
      Minute: pad(dt.minute),
      Second: pad(dt.second),
      Timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => opt(h === 0 ? 'Midnight' : h === 12 ? 'Noon' : h < 12 ? `${h}am` : `${h - 12}pm`, h));
  const WEEKDAY_OPTIONS = WEEKDAYS.map((d, i) => opt(d, i));

  const NODE_TYPES = {};
  function define(def) {
    def.version = def.version || 1;
    def.inputs = def.inputs === undefined ? (def.trigger ? [] : ['main']) : def.inputs;
    def.outputs = def.outputs || ['main'];
    def.properties = def.properties || [];
    NODE_TYPES[def.type] = def;
  }

  // ----- Triggers -----

  define({
    type: 'n8n-nodes-base.manualTrigger', version: 1, displayName: 'When clicking ‘Test workflow’', name: 'When clicking ‘Test workflow’',
    trigger: true, icon: 'pointer', color: '#909298', category: 'trigger', triggerLabel: 'Trigger manually',
    description: 'Runs the flow on clicking a button in n8n-style editor. Good for getting started quickly',
    properties: [{ name: 'notice', type: 'notice', displayName: 'This node is where the workflow execution starts (when you click the ‘test’ button on the canvas).' }],
    async execute(ctx) { return [ctx.triggerItems || [{ json: {} }]]; },
  });

  define({
    type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, displayName: 'Schedule Trigger', name: 'Schedule Trigger',
    trigger: true, icon: 'clock', color: '#31C49F', category: 'trigger', triggerLabel: 'On a schedule',
    description: 'Runs the flow every day, hour, or custom interval',
    subtitle: (p) => describeSchedule(p),
    properties: [
      { name: 'notice', type: 'notice', displayName: 'This workflow will run on the schedule you define here once you activate it. For testing, you can also trigger it manually.' },
      {
        name: 'rule', displayName: 'Trigger Rules', type: 'fixedCollection', typeOptions: { multipleValues: true }, placeholder: 'Add Rule',
        default: { interval: [{ field: 'days' }] },
        options: [{ name: 'interval', displayName: 'Trigger Interval', values: [
          { name: 'field', displayName: 'Trigger Interval', type: 'options', default: 'days', options: [
            opt('Seconds', 'seconds'), opt('Minutes', 'minutes'), opt('Hours', 'hours'), opt('Days', 'days'),
            opt('Weeks', 'weeks'), opt('Months', 'months'), opt('Custom (Cron)', 'cronExpression')] },
          { name: 'minutesInterval', displayName: 'Minutes Between Triggers', type: 'number', default: 5, displayOptions: { show: { field: ['minutes'] } } },
          { name: 'hoursInterval', displayName: 'Hours Between Triggers', type: 'number', default: 1, displayOptions: { show: { field: ['hours'] } } },
          { name: 'daysInterval', displayName: 'Days Between Triggers', type: 'number', default: 1, displayOptions: { show: { field: ['days'] } } },
          { name: 'weeksInterval', displayName: 'Weeks Between Triggers', type: 'number', default: 1, displayOptions: { show: { field: ['weeks'] } } },
          { name: 'monthsInterval', displayName: 'Months Between Triggers', type: 'number', default: 1, displayOptions: { show: { field: ['months'] } } },
          { name: 'triggerAtDayOfMonth', displayName: 'Trigger at Day of Month', type: 'number', default: 1, displayOptions: { show: { field: ['months'] } } },
          { name: 'triggerAtDay', displayName: 'Trigger on Weekdays', type: 'multiOptions', default: [0], options: WEEKDAY_OPTIONS, displayOptions: { show: { field: ['weeks'] } } },
          { name: 'triggerAtHour', displayName: 'Trigger at Hour', type: 'options', default: 0, options: HOUR_OPTIONS, displayOptions: { show: { field: ['days', 'weeks', 'months'] } } },
          { name: 'triggerAtMinute', displayName: 'Trigger at Minute', type: 'number', default: 0, displayOptions: { show: { field: ['hours', 'days', 'weeks', 'months'] } } },
          { name: 'expression', displayName: 'Expression', type: 'string', default: '', placeholder: 'eg. 0 9 * * 1-5', description: 'Format: [Minute] [Hour] [Day of Month] [Month] [Day of Week]', displayOptions: { show: { field: ['cronExpression'] } } },
        ] }],
      },
    ],
    async execute(ctx) { return [ctx.triggerItems || [{ json: readableDate(new Date()) }]]; },
  });

  define({
    type: 'n8n-nodes-base.webhook', version: 2, displayName: 'Webhook', name: 'Webhook',
    trigger: true, icon: 'webhook', color: '#885577', category: 'trigger', triggerLabel: 'On webhook call',
    description: 'Runs the flow on receiving an HTTP request',
    subtitle: (p) => `${p.httpMethod || 'GET'}: /${p.path || ''}`,
    onCreate(params) { params.path = uuid(); },
    properties: [
      { name: 'webhookUrls', type: 'webhookUrls', displayName: 'Webhook URLs' },
      { name: 'httpMethod', displayName: 'HTTP Method', type: 'options', default: 'GET', options: ['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT'].map((m) => opt(m, m)) },
      { name: 'path', displayName: 'Path', type: 'string', default: '', placeholder: 'webhook', required: true },
      { name: 'responseMode', displayName: 'Respond', type: 'options', default: 'onReceived', options: [
        opt('Immediately', 'onReceived', 'As soon as this node executes'),
        opt('When Last Node Finishes', 'lastNode', 'Returns data of the last-executed node'),
        opt("Using 'Respond to Webhook' Node", 'responseNode', 'Response defined in that node')] },
      { name: 'responseData', displayName: 'Response Data', type: 'options', default: 'firstEntryJson', displayOptions: { show: { responseMode: ['lastNode'] } }, options: [
        opt('All Entries', 'allEntries'), opt('First Entry JSON', 'firstEntryJson'), opt('No Response Body', 'noData')] },
      { name: 'notice', type: 'notice', displayName: "Insert a 'Respond to Webhook' node to control when and how you respond.", displayOptions: { show: { responseMode: ['responseNode'] } } },
      { name: 'options', displayName: 'Options', type: 'collection', placeholder: 'Add option', default: {}, options: [
        { name: 'responseCode', displayName: 'Response Code', type: 'number', default: 200 },
      ] },
    ],
    async execute(ctx) {
      return [ctx.triggerItems || [{ json: { headers: {}, params: {}, query: {}, body: {}, webhookUrl: '', executionMode: 'test' } }]];
    },
  });

  // ----- Core -----

  async function doRequest(ctx, req) {
    const fetchFn = ctx.fetch;
    const url = new URL(req.url);
    for (const [k, v] of Object.entries(req.qs || {})) url.searchParams.append(k, v);
    const headers = { ...(req.headers || {}) };
    let body = req.body;
    const hasType = Object.keys(headers).some((h) => h.toLowerCase() === 'content-type');
    if (body !== undefined && typeof body !== 'string' && !(body instanceof URLSearchParams)) {
      body = JSON.stringify(body);
      if (!hasType) headers['Content-Type'] = 'application/json';
    }
    const timeout = req.timeout || 300000;
    let res;
    try {
      res = await fetchFn(url.toString(), {
        method: req.method || 'GET', headers, body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body,
        signal: AbortSignal.timeout ? AbortSignal.timeout(timeout) : undefined,
      });
    } catch (err) {
      const reason = err && err.cause && err.cause.message ? err.cause.message : err.message;
      throw new NodeError(`The connection to ${url.host} failed`, `${reason}. In the browser preview, the API must allow cross-origin requests (CORS).`);
    }
    const text = await res.text();
    let data = text;
    const ctype = res.headers.get('content-type') || '';
    if (req.responseFormat === 'json' || (req.responseFormat !== 'text' && (ctype.includes('json') || /^\s*[[{]/.test(text)))) {
      try { data = text ? JSON.parse(text) : {}; } catch { if (req.responseFormat === 'json') throw new NodeError('Response body is not valid JSON'); }
    }
    if (!res.ok && !req.ignoreHttpStatusErrors) {
      const msg = isObject(data) ? (data.error && (data.error.message || data.error)) || data.message || data.description : String(data).slice(0, 300);
      throw new NodeError(`${res.status} - ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`, `Request to ${url.host} failed with status code ${res.status}`);
    }
    if (req.returnFullResponse) {
      return { body: data, headers: Object.fromEntries(res.headers), statusCode: res.status, statusMessage: res.statusText };
    }
    return data;
  }

  const AUTH_CREDENTIALS = ['httpBasicAuth', 'httpHeaderAuth', 'httpQueryAuth', 'httpBearerAuth'];

  define({
    type: 'n8n-nodes-base.httpRequest', version: 4.2, displayName: 'HTTP Request', name: 'HTTP Request',
    icon: 'globe', color: '#0004F5', category: 'core', description: 'Makes an HTTP request and returns the response data',
    subtitle: (p) => `${p.method || 'GET'}: ${String(p.url || '').replace(/^=/, '')}`,
    credentials: AUTH_CREDENTIALS.map((name) => ({ name, displayOptions: { show: { authentication: ['genericCredentialType'], genericAuthType: [name] } } })),
    properties: [
      { name: 'method', displayName: 'Method', type: 'options', default: 'GET', options: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'].map((m) => opt(m, m)) },
      { name: 'url', displayName: 'URL', type: 'string', default: '', placeholder: 'http://example.com/index.html', required: true },
      { name: 'authentication', displayName: 'Authentication', type: 'options', default: 'none', options: [opt('None', 'none'), opt('Generic Credential Type', 'genericCredentialType')] },
      { name: 'genericAuthType', displayName: 'Generic Auth Type', type: 'options', default: 'httpHeaderAuth', displayOptions: { show: { authentication: ['genericCredentialType'] } }, options: [
        opt('Basic Auth', 'httpBasicAuth'), opt('Bearer Auth', 'httpBearerAuth'), opt('Header Auth', 'httpHeaderAuth'), opt('Query Auth', 'httpQueryAuth')] },
      { name: 'sendQuery', displayName: 'Send Query Parameters', type: 'boolean', default: false },
      { name: 'specifyQuery', displayName: 'Specify Query Parameters', type: 'options', default: 'keypair', displayOptions: { show: { sendQuery: [true] } }, options: [opt('Using Fields Below', 'keypair'), opt('Using JSON', 'json')] },
      kv('queryParameters', 'Query Parameters', { displayOptions: { show: { sendQuery: [true], specifyQuery: ['keypair'] } } }),
      { name: 'jsonQuery', displayName: 'JSON', type: 'json', default: '', displayOptions: { show: { sendQuery: [true], specifyQuery: ['json'] } } },
      { name: 'sendHeaders', displayName: 'Send Headers', type: 'boolean', default: false },
      { name: 'specifyHeaders', displayName: 'Specify Headers', type: 'options', default: 'keypair', displayOptions: { show: { sendHeaders: [true] } }, options: [opt('Using Fields Below', 'keypair'), opt('Using JSON', 'json')] },
      kv('headerParameters', 'Header Parameters', { displayOptions: { show: { sendHeaders: [true], specifyHeaders: ['keypair'] } } }),
      { name: 'jsonHeaders', displayName: 'JSON', type: 'json', default: '', displayOptions: { show: { sendHeaders: [true], specifyHeaders: ['json'] } } },
      { name: 'sendBody', displayName: 'Send Body', type: 'boolean', default: false },
      { name: 'contentType', displayName: 'Body Content Type', type: 'options', default: 'json', displayOptions: { show: { sendBody: [true] } }, options: [
        opt('Form Urlencoded', 'form-urlencoded'), opt('JSON', 'json'), opt('Raw', 'raw')] },
      { name: 'specifyBody', displayName: 'Specify Body', type: 'options', default: 'keypair', displayOptions: { show: { sendBody: [true], contentType: ['json', 'form-urlencoded'] } }, options: [opt('Using Fields Below', 'keypair'), opt('Using JSON', 'json')] },
      kv('bodyParameters', 'Body Parameters', { displayOptions: { show: { sendBody: [true], contentType: ['json', 'form-urlencoded'], specifyBody: ['keypair'] } } }),
      { name: 'jsonBody', displayName: 'JSON', type: 'json', default: '', displayOptions: { show: { sendBody: [true], contentType: ['json'], specifyBody: ['json'] } } },
      { name: 'rawContentType', displayName: 'Content Type', type: 'string', default: '', placeholder: 'text/html', displayOptions: { show: { sendBody: [true], contentType: ['raw'] } } },
      { name: 'body', displayName: 'Body', type: 'string', default: '', typeOptions: { rows: 4 }, displayOptions: { show: { sendBody: [true], contentType: ['raw'] } } },
      { name: 'options', displayName: 'Options', type: 'collection', placeholder: 'Add option', default: {}, options: [
        { name: 'response', displayName: 'Response', type: 'fixedCollection', default: { response: { fullResponse: false, neverError: false, responseFormat: 'autodetect' } }, options: [
          { name: 'response', displayName: 'Response', values: [
            { name: 'fullResponse', displayName: 'Include Response Headers and Status', type: 'boolean', default: false },
            { name: 'neverError', displayName: 'Never Error', type: 'boolean', default: false },
            { name: 'responseFormat', displayName: 'Response Format', type: 'options', default: 'autodetect', options: [opt('Autodetect', 'autodetect'), opt('JSON', 'json'), opt('Text', 'text')] },
          ] }] },
        { name: 'timeout', displayName: 'Timeout', type: 'number', default: 10000, description: 'Time in ms to wait for the server to send a response before aborting' },
      ] },
    ],
    async execute(ctx) {
      const items = ctx.getInputData();
      const out = [];
      for (let i = 0; i < items.length; i++) {
        const p = (name, fb) => ctx.getNodeParameter(name, i, fb);
        const method = p('method');
        const url = String(p('url') || '').trim();
        if (!/^https?:\/\//i.test(url)) throw new NodeError(`Invalid URL: ${url || '(empty)'}`, 'URL parameter must start with http:// or https://');
        const req = { method, url, headers: {}, qs: {} };
        if (p('sendQuery')) Object.assign(req.qs, p('specifyQuery') === 'json' ? parseJsonParam(p('jsonQuery'), 'Query JSON') : pairsToObject(p('queryParameters')));
        if (p('sendHeaders')) Object.assign(req.headers, p('specifyHeaders') === 'json' ? parseJsonParam(p('jsonHeaders'), 'Headers JSON') : pairsToObject(p('headerParameters')));
        if (p('sendBody')) {
          const contentType = p('contentType');
          if (contentType === 'raw') {
            req.body = String(p('body') ?? '');
            if (p('rawContentType')) req.headers['Content-Type'] = p('rawContentType');
          } else {
            const data = p('specifyBody') === 'json' ? parseJsonParam(p('jsonBody'), 'JSON body') : pairsToObject(p('bodyParameters'));
            if (contentType === 'form-urlencoded') {
              req.body = new URLSearchParams(data).toString();
              req.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            } else req.body = data;
          }
        }
        if (p('authentication') === 'genericCredentialType') {
          const type = p('genericAuthType');
          const cred = await ctx.getCredentials(type);
          if (type === 'httpBasicAuth') req.headers.Authorization = `Basic ${btoa(`${cred.user || ''}:${cred.password || ''}`)}`;
          if (type === 'httpHeaderAuth') req.headers[cred.name] = cred.value;
          if (type === 'httpBearerAuth') req.headers.Authorization = `Bearer ${cred.token}`;
          if (type === 'httpQueryAuth') req.qs[cred.name] = cred.value;
        }
        const options = p('options') || {};
        const resp = (options.response && options.response.response) || {};
        req.returnFullResponse = Boolean(resp.fullResponse);
        req.ignoreHttpStatusErrors = Boolean(resp.neverError);
        req.responseFormat = resp.responseFormat || 'autodetect';
        req.timeout = options.timeout;
        const data = await doRequest(ctx, req);
        const pushOne = (v) => out.push({ json: isObject(v) ? v : { data: v }, pairedItem: { item: i } });
        if (Array.isArray(data) && !req.returnFullResponse) data.forEach(pushOne);
        else pushOne(data);
      }
      return [out];
    },
  });

  const JS_ALL_DEFAULT = "// Loop over input items and add a new field called 'myNewField' to the JSON of each one\nfor (const item of $input.all()) {\n  item.json.myNewField = 1;\n}\n\nreturn $input.all();";
  const JS_EACH_DEFAULT = "// Add a new field called 'myNewField' to the JSON of the item\n$input.item.json.myNewField = 1;\n\nreturn $input.item;";

  define({
    type: 'n8n-nodes-base.code', version: 2, displayName: 'Code', name: 'Code', icon: 'code', color: '#FF9922', category: 'core',
    description: 'Run custom JavaScript code',
    properties: [
      { name: 'mode', displayName: 'Mode', type: 'options', default: 'runOnceForAllItems', options: [
        opt('Run Once for All Items', 'runOnceForAllItems', 'Run this code only once, no matter how many input items there are'),
        opt('Run Once for Each Item', 'runOnceForEachItem', 'Run this code as many times as there are input items')] },
      { name: 'language', displayName: 'Language', type: 'options', default: 'javaScript', options: [opt('JavaScript', 'javaScript')] },
      { name: 'jsCode', displayName: 'JavaScript', type: 'code', default: JS_ALL_DEFAULT, typeOptions: { rows: 12 }, displayOptions: { show: { mode: ['runOnceForAllItems'] } } },
      { name: 'jsCode', displayName: 'JavaScript', type: 'code', default: JS_EACH_DEFAULT, typeOptions: { rows: 12 }, displayOptions: { show: { mode: ['runOnceForEachItem'] } } },
      { name: 'notice', type: 'notice', displayName: 'Type $ for a list of special vars/methods. Debug by using console.log() statements and viewing their output in the output panel.' },
    ],
    async execute(ctx) {
      const items = clone(ctx.getInputData());
      const mode = ctx.getNodeParameter('mode', 0);
      const code = ctx.getNodeParameter('jsCode', 0, '', { raw: true });
      const normalize = (result, single) => {
        if (result === undefined || result === null) throw new NodeError(single ? "Code doesn't return an object" : "Code doesn't return items properly", 'Please return an array of objects, one for each item you would like to output.');
        if (!Array.isArray(result)) result = [result];
        return result.map((r) => {
          if (isObject(r) && isObject(r.json)) return { json: r.json };
          if (isObject(r)) return { json: r };
          throw new NodeError("Code doesn't return items properly", 'Please return an array of objects, one for each item you would like to output.');
        });
      };
      if (mode === 'runOnceForEachItem') {
        const out = [];
        for (let i = 0; i < items.length; i++) {
          const env = ctx.codeContext(items, i);
          const res = await ctx.runCode(code, env);
          normalize(res, true).forEach((r) => out.push({ ...r, pairedItem: { item: i } }));
        }
        return [out];
      }
      const env = ctx.codeContext(items, 0);
      return [normalize(await ctx.runCode(code, env), false)];
    },
  });

  define({
    type: 'n8n-nodes-base.respondToWebhook', version: 1.1, displayName: 'Respond to Webhook', name: 'Respond to Webhook',
    icon: 'reply', color: '#885577', category: 'core', description: 'Returns data for Webhook',
    properties: [
      { name: 'notice', type: 'notice', displayName: 'Verify that the "Webhook" node\'s "Respond" parameter is set to "Using Respond to Webhook Node".' },
      { name: 'respondWith', displayName: 'Respond With', type: 'options', default: 'firstIncomingItem', options: [
        opt('All Incoming Items', 'allIncomingItems'), opt('First Incoming Item', 'firstIncomingItem'), opt('JSON', 'json'),
        opt('No Data', 'noData'), opt('Redirect', 'redirect'), opt('Text', 'text')] },
      { name: 'redirectURL', displayName: 'Redirect URL', type: 'string', default: '', required: true, displayOptions: { show: { respondWith: ['redirect'] } } },
      { name: 'responseBody', displayName: 'Response Body', type: 'json', default: '{\n  "myField": "value"\n}', displayOptions: { show: { respondWith: ['json'] } } },
      { name: 'responseBody', displayName: 'Response Body', type: 'string', default: '', typeOptions: { rows: 2 }, displayOptions: { show: { respondWith: ['text'] } } },
      { name: 'options', displayName: 'Options', type: 'collection', placeholder: 'Add option', default: {}, options: [
        { name: 'responseCode', displayName: 'Response Code', type: 'number', default: 200 },
        { name: 'responseHeaders', displayName: 'Response Headers', type: 'fixedCollection', typeOptions: { multipleValues: true }, default: { entries: [{ name: '', value: '' }] }, options: [
          { name: 'entries', displayName: 'Entries', values: [
            { name: 'name', displayName: 'Name', type: 'string', default: '' },
            { name: 'value', displayName: 'Value', type: 'string', default: '' }] }] },
      ] },
    ],
    async execute(ctx) {
      const items = ctx.getInputData();
      const respondWith = ctx.getNodeParameter('respondWith', 0);
      const options = ctx.getNodeParameter('options', 0) || {};
      const headers = pairsToObject(options.responseHeaders, 'entries');
      let body;
      let status = options.responseCode || 200;
      if (respondWith === 'allIncomingItems') body = items.map((i) => i.json);
      else if (respondWith === 'firstIncomingItem') body = items[0] ? items[0].json : {};
      else if (respondWith === 'json') body = parseJsonParam(ctx.getNodeParameter('responseBody', 0), 'Response Body');
      else if (respondWith === 'text') body = String(ctx.getNodeParameter('responseBody', 0) ?? '');
      else if (respondWith === 'redirect') {
        status = options.responseCode || 307;
        headers.Location = ctx.getNodeParameter('redirectURL', 0);
        body = '';
      } else body = '';
      ctx.respond({ status, headers, body });
      return [items];
    },
  });

  function parseFeed(xml) {
    const tag = (block, name) => {
      const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
      if (!m) {
        const link = name === 'link' && block.match(/<link[^>]*href="([^"]+)"/i);
        return link ? link[1] : undefined;
      }
      return m[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();
    };
    const strip = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
    const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
    return blocks.map((b) => {
      const content = tag(b, 'content:encoded') || tag(b, 'content') || tag(b, 'description') || tag(b, 'summary') || '';
      const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
      const out = { title: strip(tag(b, 'title')), link: tag(b, 'link'), pubDate: date, content, contentSnippet: strip(content).slice(0, 500), guid: tag(b, 'guid') || tag(b, 'id') };
      if (date && !Number.isNaN(Date.parse(date))) out.isoDate = new Date(date).toISOString();
      const creator = tag(b, 'dc:creator') || tag(b, 'author');
      if (creator) out.creator = strip(creator);
      return out;
    });
  }

  define({
    type: 'n8n-nodes-base.rssFeedRead', version: 1.1, displayName: 'RSS Read', name: 'RSS Read', icon: 'rss', color: '#b02020', category: 'core',
    description: 'Reads data from an RSS Feed', subtitle: (p) => String(p.url || '').replace(/^=/, ''),
    properties: [{ name: 'url', displayName: 'URL', type: 'string', default: '', required: true, placeholder: 'https://example.com/feed.xml' }],
    async execute(ctx) {
      const out = [];
      const items = ctx.getInputData();
      for (let i = 0; i < items.length; i++) {
        const url = ctx.getNodeParameter('url', i);
        if (!url) throw new NodeError('The parameter "URL" has to be set!');
        const xml = await doRequest(ctx, { url, responseFormat: 'text' });
        parseFeed(String(xml)).forEach((entry) => out.push({ json: entry, pairedItem: { item: i } }));
      }
      return [out];
    },
  });

  // ----- Flow -----

  define({
    type: 'n8n-nodes-base.if', version: 2.2, displayName: 'If', name: 'If', icon: 'if', color: '#408000', category: 'flow',
    description: 'Route items to different branches (true/false)', outputs: ['true', 'false'],
    properties: [
      { name: 'conditions', displayName: 'Conditions', type: 'filter', default: defaultFilter() },
      { name: 'options', displayName: 'Options', type: 'collection', placeholder: 'Add option', default: {}, options: [
        { name: 'ignoreCase', displayName: 'Ignore Case', type: 'boolean', default: false }] },
    ],
    async execute(ctx) {
      const t = [], f = [];
      ctx.getInputData().forEach((item, i) => {
        const filter = ctx.getNodeParameter('conditions', i);
        if (ctx.getNodeParameter('options', i).ignoreCase && filter.options) filter.options.caseSensitive = false;
        (evaluateFilter(filter, ctx.getNodeParameter('combineOperation', i, 'all')) ? t : f).push({ ...item, pairedItem: { item: i } });
      });
      return [t, f];
    },
  });

  define({
    type: 'n8n-nodes-base.filter', version: 2.2, displayName: 'Filter', name: 'Filter', icon: 'filter', color: '#229eff', category: 'flow',
    description: 'Remove items matching a condition',
    properties: [
      { name: 'conditions', displayName: 'Conditions', type: 'filter', default: defaultFilter() },
      { name: 'options', displayName: 'Options', type: 'collection', placeholder: 'Add option', default: {}, options: [
        { name: 'ignoreCase', displayName: 'Ignore Case', type: 'boolean', default: false }] },
    ],
    async execute(ctx) {
      const kept = [];
      ctx.getInputData().forEach((item, i) => {
        const filter = ctx.getNodeParameter('conditions', i);
        if (ctx.getNodeParameter('options', i).ignoreCase && filter.options) filter.options.caseSensitive = false;
        if (evaluateFilter(filter)) kept.push({ ...item, pairedItem: { item: i } });
      });
      return [kept];
    },
  });

  define({
    type: 'n8n-nodes-base.switch', version: 3.2, displayName: 'Switch', name: 'Switch', icon: 'switch', color: '#506000', category: 'flow',
    description: 'Route items depending on defined expression or rules',
    outputs: (p) => {
      if (p.mode === 'expression') return Array.from({ length: Number(p.numberOutputs) || 4 }, (_, i) => String(i));
      const rules = ((p.rules && p.rules.values) || []).map((r, i) => (r.renameOutput && r.outputKey ? r.outputKey : String(i)));
      if (p.options && p.options.fallbackOutput === 'extra') rules.push('Fallback');
      return rules.length ? rules : ['0'];
    },
    properties: [
      { name: 'mode', displayName: 'Mode', type: 'options', default: 'rules', options: [
        opt('Rules', 'rules', 'Build a matching rule for each output'), opt('Expression', 'expression', 'Write an expression to return the output index')] },
      { name: 'rules', displayName: 'Routing Rules', type: 'fixedCollection', typeOptions: { multipleValues: true }, placeholder: 'Add Routing Rule',
        default: { values: [{ conditions: defaultFilter(), renameOutput: false, outputKey: '' }] }, displayOptions: { show: { mode: ['rules'] } },
        options: [{ name: 'values', displayName: 'Values', values: [
          { name: 'conditions', displayName: 'Conditions', type: 'filter', default: defaultFilter() },
          { name: 'renameOutput', displayName: 'Rename Output', type: 'boolean', default: false },
          { name: 'outputKey', displayName: 'Output Name', type: 'string', default: '', displayOptions: { show: { renameOutput: [true] } } },
        ] }] },
      { name: 'numberOutputs', displayName: 'Number of Outputs', type: 'number', default: 4, displayOptions: { show: { mode: ['expression'] } } },
      { name: 'output', displayName: 'Output Index', type: 'number', default: 0, description: 'The output index to send the input item to. Use an expression to calculate it.', displayOptions: { show: { mode: ['expression'] } } },
      { name: 'options', displayName: 'Options', type: 'collection', placeholder: 'Add option', default: {}, displayOptions: { show: { mode: ['rules'] } }, options: [
        { name: 'fallbackOutput', displayName: 'Fallback Output', type: 'options', default: 'none', options: [opt('None (default)', 'none'), opt('Extra Output', 'extra')] },
        { name: 'allMatchingOutputs', displayName: 'Send data to all matching outputs', type: 'boolean', default: false },
        { name: 'ignoreCase', displayName: 'Ignore Case', type: 'boolean', default: false },
      ] },
    ],
    async execute(ctx) {
      const params = ctx.getNodeParameter('', 0, undefined, { raw: true });
      const outputs = NODE_TYPES['n8n-nodes-base.switch'].outputs(params).map(() => []);
      ctx.getInputData().forEach((item, i) => {
        const paired = { ...item, pairedItem: { item: i } };
        if (ctx.getNodeParameter('mode', i) === 'expression') {
          const idx = Number(ctx.getNodeParameter('output', i));
          if (!outputs[idx]) throw new NodeError(`The output ${idx} is not allowed`, `It has to be between 0 and ${outputs.length - 1}!`);
          outputs[idx].push(paired);
          return;
        }
        const rules = (ctx.getNodeParameter('rules', i).values) || [];
        const options = ctx.getNodeParameter('options', i) || {};
        let matched = false;
        for (let r = 0; r < rules.length; r++) {
          const filter = rules[r].conditions;
          if (options.ignoreCase && filter.options) filter.options.caseSensitive = false;
          if (evaluateFilter(filter)) {
            outputs[r].push(paired);
            matched = true;
            if (!options.allMatchingOutputs) break;
          }
        }
        if (!matched && options.fallbackOutput === 'extra') outputs[outputs.length - 1].push(paired);
      });
      return outputs;
    },
  });

  define({
    type: 'n8n-nodes-base.merge', version: 3, displayName: 'Merge', name: 'Merge', icon: 'merge', color: '#00bbcc', category: 'flow',
    description: 'Merges data of multiple streams once data from both is available', inputs: ['Input 1', 'Input 2'],
    subtitle: (p) => ({ append: 'Append', combine: 'Combine', chooseBranch: 'Choose Branch' }[p.mode] || ''),
    properties: [
      { name: 'mode', displayName: 'Mode', type: 'options', default: 'append', options: [
        opt('Append', 'append', 'Output items of each input, one after the other'),
        opt('Combine', 'combine', 'Merge matching items together'),
        opt('Choose Branch', 'chooseBranch', 'Output data from a specific branch, without modifying it')] },
      { name: 'combineBy', displayName: 'Combine By', type: 'options', default: 'combineByFields', displayOptions: { show: { mode: ['combine'] } }, options: [
        opt('Matching Fields', 'combineByFields', 'Combine items with the same field values'),
        opt('Position', 'combineByPosition', 'Combine items based on their order'),
        opt('All Possible Combinations', 'combineAll', 'Every pairing of every two items (cross join)')] },
      { name: 'fieldsToMatchString', displayName: 'Fields To Match Have Same Names', type: 'string', default: '', placeholder: 'e.g. id, name', description: 'Specify the fields to use for matching input items', displayOptions: { show: { mode: ['combine'], combineBy: ['combineByFields'] } } },
      { name: 'joinMode', displayName: 'Output Type', type: 'options', default: 'keepMatches', displayOptions: { show: { mode: ['combine'], combineBy: ['combineByFields'] } }, options: [
        opt('Keep Matches', 'keepMatches'), opt('Keep Non-Matches', 'keepNonMatches'), opt('Keep Everything', 'keepEverything'),
        opt('Enrich Input 1', 'enrichInput1'), opt('Enrich Input 2', 'enrichInput2')] },
      { name: 'useDataOfInput', displayName: 'Use Data of Input', type: 'options', default: 1, displayOptions: { show: { mode: ['chooseBranch'] } }, options: [opt('Input 1', 1), opt('Input 2', 2)] },
    ],
    async execute(ctx) {
      const a = ctx.getInputData(0);
      const b = ctx.getInputData(1);
      const mode = ctx.getNodeParameter('mode', 0);
      if (mode === 'append') return [[...a, ...b]];
      if (mode === 'chooseBranch') return [Number(ctx.getNodeParameter('useDataOfInput', 0)) === 2 ? b : a];
      const combineBy = ctx.getNodeParameter('combineBy', 0);
      const mergeJson = (x, y) => ({ json: { ...(x ? x.json : {}), ...(y ? y.json : {}) } });
      if (combineBy === 'combineByPosition') {
        const n = Math.min(a.length, b.length);
        return [Array.from({ length: n }, (_, i) => mergeJson(a[i], b[i]))];
      }
      if (combineBy === 'combineAll') return [a.flatMap((x) => b.map((y) => mergeJson(x, y)))];
      const fields = String(ctx.getNodeParameter('fieldsToMatchString', 0) || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!fields.length) throw new NodeError('You need to define at least one pair of fields in "Fields to Match"');
      const key = (item) => JSON.stringify(fields.map((f) => getPath(item.json, f)));
      const bByKey = new Map();
      b.forEach((y) => { const k = key(y); if (!bByKey.has(k)) bByKey.set(k, []); bByKey.get(k).push(y); });
      const aKeys = new Set(a.map(key));
      const joinMode = ctx.getNodeParameter('joinMode', 0);
      const out = [];
      for (const x of a) {
        const matches = bByKey.get(key(x)) || [];
        if (joinMode === 'keepMatches') matches.forEach((y) => out.push(mergeJson(x, y)));
        if (joinMode === 'keepNonMatches' && !matches.length) out.push(x);
        if (joinMode === 'keepEverything' || joinMode === 'enrichInput1') {
          if (matches.length) matches.forEach((y) => out.push(mergeJson(x, y)));
          else out.push(x);
        }
      }
      if (joinMode === 'keepNonMatches' || joinMode === 'keepEverything') b.filter((y) => !aKeys.has(key(y))).forEach((y) => out.push(y));
      if (joinMode === 'enrichInput2') {
        const aByKey = new Map(a.map((x) => [key(x), x]));
        b.forEach((y) => out.push(aByKey.has(key(y)) ? mergeJson(aByKey.get(key(y)), y) : y));
      }
      return [out];
    },
  });

  define({
    type: 'n8n-nodes-base.wait', version: 1.1, displayName: 'Wait', name: 'Wait', icon: 'pause', color: '#804050', category: 'flow',
    description: 'Wait before continuing with execution',
    subtitle: (p) => (p.resume === 'specificTime' ? 'Until specific time' : `${p.amount} ${p.unit}`),
    properties: [
      { name: 'resume', displayName: 'Resume', type: 'options', default: 'timeInterval', options: [
        opt('After Time Interval', 'timeInterval', 'Waits for a certain amount of time'), opt('At Specified Time', 'specificTime', 'Waits until a specific date and time to continue')] },
      { name: 'amount', displayName: 'Wait Amount', type: 'number', default: 1, displayOptions: { show: { resume: ['timeInterval'] } } },
      { name: 'unit', displayName: 'Wait Unit', type: 'options', default: 'hours', displayOptions: { show: { resume: ['timeInterval'] } }, options: [
        opt('Seconds', 'seconds'), opt('Minutes', 'minutes'), opt('Hours', 'hours'), opt('Days', 'days')] },
      { name: 'dateTime', displayName: 'Date and Time', type: 'dateTime', default: '', displayOptions: { show: { resume: ['specificTime'] } } },
    ],
    async execute(ctx) {
      let ms;
      if (ctx.getNodeParameter('resume', 0) === 'specificTime') ms = DateTime.from(ctx.getNodeParameter('dateTime', 0)).ts - Date.now();
      else ms = Number(ctx.getNodeParameter('amount', 0)) * { seconds: 1e3, minutes: 6e4, hours: 36e5, days: 864e5 }[ctx.getNodeParameter('unit', 0)];
      if (!(ms >= 0)) ms = 0;
      if (ms > ctx.maxWaitMs) throw new NodeError(`Waits longer than ${Math.round(ctx.maxWaitMs / 60000)} minutes aren't supported`, 'Flowlite keeps waiting executions in memory. Use a Schedule Trigger for longer delays.');
      await sleep(ms);
      return [ctx.getInputData()];
    },
  });

  define({
    type: 'n8n-nodes-base.noOp', version: 1, displayName: 'No Operation, do nothing', name: 'No Operation, do nothing', icon: 'arrowRight', color: '#b0b0b0', category: 'flow',
    description: 'No Operation',
    async execute(ctx) { return [ctx.getInputData()]; },
  });

  // ----- Data transformation -----

  function convertAssignment(value, type, name, ignoreErrors) {
    const fail = () => {
      if (ignoreErrors) return value;
      throw new NodeError(`'${name}' expects a ${type} but we got '${stringifyValue(value)}'`);
    };
    switch (type) {
      case 'number': { if (value === '' || value === null) return null; const n = Number(value); return Number.isNaN(n) ? fail() : n; }
      case 'boolean': return typeof value === 'boolean' ? value : toBool(value);
      case 'array':
      case 'object': {
        if (typeof value === 'string') {
          try { value = JSON.parse(value); } catch { return fail(); }
        }
        if (type === 'array' ? !Array.isArray(value) : !isObject(value)) return fail();
        return value;
      }
      case 'string': return typeof value === 'string' ? value : stringifyValue(value);
      default: return value;
    }
  }

  define({
    type: 'n8n-nodes-base.set', version: 3.4, displayName: 'Edit Fields (Set)', name: 'Edit Fields', icon: 'pen', color: '#0000FF', category: 'transform',
    description: 'Modify, add, or remove item fields',
    subtitle: (p) => (p.mode === 'raw' ? 'JSON' : 'manual'),
    properties: [
      { name: 'mode', displayName: 'Mode', type: 'options', default: 'manual', options: [
        opt('Manual Mapping', 'manual', 'Edit item fields one by one'), opt('JSON', 'raw', 'Customize item output with JSON')] },
      { name: 'assignments', displayName: 'Fields to Set', type: 'assignmentCollection', default: { assignments: [] }, displayOptions: { show: { mode: ['manual'] } } },
      { name: 'jsonOutput', displayName: 'JSON', type: 'json', default: '{\n  "my_field_1": "value",\n  "my_field_2": 1\n}\n', displayOptions: { show: { mode: ['raw'] } } },
      { name: 'includeOtherFields', displayName: 'Include Other Input Fields', type: 'boolean', default: false, description: 'Whether to pass to the output all the input fields (along with the fields set in this node)' },
      { name: 'include', displayName: 'Input Fields to Include', type: 'options', default: 'all', displayOptions: { show: { includeOtherFields: [true] } }, options: [
        opt('All', 'all'), opt('Selected', 'selected'), opt('All Except', 'except')] },
      { name: 'includeFields', displayName: 'Fields to Include', type: 'string', default: '', placeholder: 'e.g. fieldToInclude1,fieldToInclude2', displayOptions: { show: { includeOtherFields: [true], include: ['selected'] } } },
      { name: 'excludeFields', displayName: 'Fields to Exclude', type: 'string', default: '', placeholder: 'e.g. fieldToExclude1,fieldToExclude2', displayOptions: { show: { includeOtherFields: [true], include: ['except'] } } },
      { name: 'options', displayName: 'Options', type: 'collection', placeholder: 'Add option', default: {}, options: [
        { name: 'dotNotation', displayName: 'Support Dot Notation', type: 'boolean', default: true },
        { name: 'ignoreConversionErrors', displayName: 'Ignore Type Conversion Errors', type: 'boolean', default: false },
      ] },
    ],
    async execute(ctx) {
      const out = [];
      ctx.getInputData().forEach((item, i) => {
        // Check the node's own parameters (without defaults) to recognise older Set versions.
        const own = ctx.node.parameters || {};
        const legacyValues = own.values && !own.assignments;
        const legacyFields = own.fields && !own.assignments;
        const options = ctx.getNodeParameter('options', i) || {};
        const dot = options.dotNotation !== false;
        let json = {};
        if (ctx.getNodeParameter('includeOtherFields', i) || (legacyValues && own.keepOnlySet !== true)) {
          const include = ctx.getNodeParameter('include', i, 'all');
          const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
          if (include === 'selected') list(ctx.getNodeParameter('includeFields', i)).forEach((f) => { const v = getPath(item.json, f); if (v !== undefined) setPath(json, f, clone(v)); });
          else {
            json = clone(item.json);
            if (include === 'except') list(ctx.getNodeParameter('excludeFields', i)).forEach((f) => delete json[f]);
          }
        }
        const put = (name, value) => (dot ? setPath(json, name, value) : (json[name] = value));
        if (legacyValues) {
          // Set v1/v2: { values: { string: [...], number: [...], boolean: [...] } }
          const values = ctx.getNodeParameter('values', i);
          for (const type of ['string', 'number', 'boolean']) for (const v of values[type] || []) put(v.name, convertAssignment(v.value, type, v.name, true));
        } else if (ctx.getNodeParameter('mode', i) === 'raw') {
          const parsed = parseJsonParam(ctx.getNodeParameter('jsonOutput', i), 'JSON Output');
          Object.entries(parsed).forEach(([k, v]) => put(k, v));
        } else if (legacyFields) {
          // Set v3.0-3.2: { fields: { values: [{ name, type: 'stringValue', stringValue }] } }
          for (const f of (ctx.getNodeParameter('fields', i).values) || []) {
            const type = String(f.type || 'stringValue').replace(/Value$/, '');
            put(f.name, convertAssignment(f[`${type}Value`], type === 'json' ? 'object' : type, f.name, options.ignoreConversionErrors));
          }
        } else {
          for (const a of (ctx.getNodeParameter('assignments', i).assignments) || []) {
            if (!a.name) continue;
            put(a.name, convertAssignment(a.value, a.type || 'string', a.name, options.ignoreConversionErrors));
          }
        }
        out.push({ json, pairedItem: { item: i } });
      });
      return [out];
    },
  });

  define({
    type: 'n8n-nodes-base.splitOut', version: 1, displayName: 'Split Out', name: 'Split Out', icon: 'splitOut', color: '#ff6d5a', category: 'transform',
    description: 'Turn a list inside item(s) into separate items',
    properties: [
      { name: 'fieldToSplitOut', displayName: 'Fields To Split Out', type: 'string', default: '', required: true, placeholder: 'Drag fields from the left or type their names', description: 'The name of the input fields to break out into separate items. Separate multiple field names by commas.' },
      { name: 'include', displayName: 'Include', type: 'options', default: 'noOtherFields', options: [
        opt('No Other Fields', 'noOtherFields'), opt('All Other Fields', 'allOtherFields'), opt('Selected Other Fields', 'selectedOtherFields')] },
      { name: 'fieldsToInclude', displayName: 'Fields To Include', type: 'string', default: '', displayOptions: { show: { include: ['selectedOtherFields'] } } },
      { name: 'options', displayName: 'Options', type: 'collection', placeholder: 'Add Field', default: {}, options: [
        { name: 'destinationFieldName', displayName: 'Destination Field Name', type: 'string', default: '' }] },
    ],
    async execute(ctx) {
      const out = [];
      ctx.getInputData().forEach((item, i) => {
        const fields = String(ctx.getNodeParameter('fieldToSplitOut', i) || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!fields.length) throw new NodeError('The parameter "Fields To Split Out" has to be set');
        const include = ctx.getNodeParameter('include', i);
        const dest = (ctx.getNodeParameter('options', i) || {}).destinationFieldName;
        const field = fields[0];
        let list = getPath(item.json, field);
        if (list === undefined) throw new NodeError(`The field '${field}' wasn't found in any input item`);
        if (!Array.isArray(list)) list = isObject(list) ? Object.values(list) : [list];
        list.forEach((value) => {
          let json = {};
          if (include === 'allOtherFields') { json = clone(item.json); delete json[field]; }
          if (include === 'selectedOtherFields') String(ctx.getNodeParameter('fieldsToInclude', i) || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((f) => { json[f] = clone(getPath(item.json, f)); });
          if (isObject(value) && !dest) Object.assign(json, value);
          else json[dest || field.split('.').pop()] = value;
          out.push({ json, pairedItem: { item: i } });
        });
      });
      return [out];
    },
  });

  define({
    type: 'n8n-nodes-base.aggregate', version: 1, displayName: 'Aggregate', name: 'Aggregate', icon: 'layers', color: '#ff6d5a', category: 'transform',
    description: 'Combine a field from many items into a list in a single item',
    properties: [
      { name: 'aggregate', displayName: 'Aggregate', type: 'options', default: 'aggregateIndividualFields', options: [
        opt('Individual Fields', 'aggregateIndividualFields'), opt('All Item Data (Into a Single List)', 'aggregateAllItemData')] },
      { name: 'fieldsToAggregate', displayName: 'Fields To Aggregate', type: 'fixedCollection', typeOptions: { multipleValues: true }, placeholder: 'Add Field To Aggregate',
        default: { fieldToAggregate: [{ fieldToAggregate: '', renameField: false }] }, displayOptions: { show: { aggregate: ['aggregateIndividualFields'] } },
        options: [{ name: 'fieldToAggregate', displayName: '', values: [
          { name: 'fieldToAggregate', displayName: 'Input Field Name', type: 'string', default: '' },
          { name: 'renameField', displayName: 'Rename Field', type: 'boolean', default: false },
          { name: 'outputFieldName', displayName: 'Output Field Name', type: 'string', default: '', displayOptions: { show: { renameField: [true] } } },
        ] }] },
      { name: 'destinationFieldName', displayName: 'Put Output in Field', type: 'string', default: 'data', displayOptions: { show: { aggregate: ['aggregateAllItemData'] } } },
      { name: 'options', displayName: 'Options', type: 'collection', placeholder: 'Add Field', default: {}, options: [
        { name: 'mergeLists', displayName: 'Merge Lists', type: 'boolean', default: false },
        { name: 'keepMissing', displayName: 'Keep Missing And Null Values', type: 'boolean', default: false }] },
    ],
    async execute(ctx) {
      const items = ctx.getInputData();
      if (ctx.getNodeParameter('aggregate', 0) === 'aggregateAllItemData') {
        return [[{ json: { [ctx.getNodeParameter('destinationFieldName', 0) || 'data']: items.map((i) => i.json) } }]];
      }
      const options = ctx.getNodeParameter('options', 0) || {};
      const json = {};
      for (const f of (ctx.getNodeParameter('fieldsToAggregate', 0).fieldToAggregate) || []) {
        if (!f.fieldToAggregate) continue;
        const name = f.renameField && f.outputFieldName ? f.outputFieldName : f.fieldToAggregate.split('.').pop();
        let values = items.map((it) => getPath(it.json, f.fieldToAggregate));
        if (!options.keepMissing) values = values.filter((v) => v !== undefined && v !== null);
        if (options.mergeLists) values = values.flat();
        json[name] = values;
      }
      return [[{ json }]];
    },
  });

  define({
    type: 'n8n-nodes-base.limit', version: 1, displayName: 'Limit', name: 'Limit', icon: 'limit', color: '#ff6d5a', category: 'transform',
    description: 'Restrict the number of items',
    properties: [
      { name: 'maxItems', displayName: 'Max Items', type: 'number', default: 1 },
      { name: 'keep', displayName: 'Keep', type: 'options', default: 'firstItems', options: [opt('First Items', 'firstItems'), opt('Last Items', 'lastItems')] },
    ],
    async execute(ctx) {
      const items = ctx.getInputData();
      const n = Math.max(0, Number(ctx.getNodeParameter('maxItems', 0)) || 0);
      return [ctx.getNodeParameter('keep', 0) === 'lastItems' ? items.slice(Math.max(0, items.length - n)) : items.slice(0, n)];
    },
  });

  define({
    type: 'n8n-nodes-base.sort', version: 1, displayName: 'Sort', name: 'Sort', icon: 'sort', color: '#ff6d5a', category: 'transform',
    description: 'Change items order',
    properties: [
      { name: 'type', displayName: 'Type', type: 'options', default: 'simple', options: [opt('Simple', 'simple'), opt('Random', 'random')] },
      { name: 'sortFieldsUi', displayName: 'Fields To Sort By', type: 'fixedCollection', typeOptions: { multipleValues: true }, placeholder: 'Add Field To Sort By',
        default: { sortField: [{ fieldName: '', order: 'ascending' }] }, displayOptions: { show: { type: ['simple'] } },
        options: [{ name: 'sortField', displayName: '', values: [
          { name: 'fieldName', displayName: 'Field Name', type: 'string', default: '' },
          { name: 'order', displayName: 'Order', type: 'options', default: 'ascending', options: [opt('Ascending', 'ascending'), opt('Descending', 'descending')] },
        ] }] },
    ],
    async execute(ctx) {
      const items = ctx.getInputData().slice();
      if (ctx.getNodeParameter('type', 0) === 'random') {
        for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
        return [items];
      }
      const fields = ((ctx.getNodeParameter('sortFieldsUi', 0).sortField) || []).filter((f) => f.fieldName);
      const cmp = (x, y) => {
        if (x === y) return 0;
        if (x === undefined || x === null) return 1;
        if (y === undefined || y === null) return -1;
        if (typeof x === 'number' && typeof y === 'number') return x - y;
        return String(x).localeCompare(String(y), undefined, { numeric: true });
      };
      items.sort((a, b) => {
        for (const f of fields) {
          const c = cmp(getPath(a.json, f.fieldName), getPath(b.json, f.fieldName));
          if (c) return f.order === 'descending' ? -c : c;
        }
        return 0;
      });
      return [items];
    },
  });

  define({
    type: 'n8n-nodes-base.removeDuplicates', version: 1.1, displayName: 'Remove Duplicates', name: 'Remove Duplicates', icon: 'copy', color: '#ff6d5a', category: 'transform',
    description: 'Delete items with matching field values',
    properties: [
      { name: 'compare', displayName: 'Compare', type: 'options', default: 'allFields', options: [
        opt('All Fields', 'allFields'), opt('All Fields Except', 'allFieldsExcept'), opt('Selected Fields', 'selectedFields')] },
      { name: 'fieldsToExclude', displayName: 'Fields To Exclude', type: 'string', default: '', placeholder: 'e.g. email, name', displayOptions: { show: { compare: ['allFieldsExcept'] } } },
      { name: 'fieldsToCompare', displayName: 'Fields To Compare', type: 'string', default: '', placeholder: 'e.g. email, name', displayOptions: { show: { compare: ['selectedFields'] } } },
    ],
    async execute(ctx) {
      const items = ctx.getInputData();
      const compare = ctx.getNodeParameter('compare', 0);
      const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
      const keyOf = (item) => {
        if (compare === 'selectedFields') return JSON.stringify(list(ctx.getNodeParameter('fieldsToCompare', 0)).map((f) => getPath(item.json, f)));
        const json = { ...item.json };
        if (compare === 'allFieldsExcept') list(ctx.getNodeParameter('fieldsToExclude', 0)).forEach((f) => delete json[f]);
        return JSON.stringify(json, Object.keys(json).sort());
      };
      const seen = new Set();
      return [items.filter((it) => { const k = keyOf(it); if (seen.has(k)) return false; seen.add(k); return true; })];
    },
  });

  const TIME_UNITS = ['years', 'quarters', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds'];

  define({
    type: 'n8n-nodes-base.dateTime', version: 2, displayName: 'Date & Time', name: 'Date & Time', icon: 'calendar', color: '#408000', category: 'transform',
    description: 'Manipulate date and time values',
    subtitle: (p) => ({ getCurrentDate: 'Get Current Date', addToDate: 'Add to a Date', subtractFromDate: 'Subtract From a Date', formatDate: 'Format a Date', getTimeBetweenDates: 'Get Time Between Dates', extractDate: 'Extract Part of a Date' }[p.operation] || ''),
    properties: [
      { name: 'operation', displayName: 'Operation', type: 'options', default: 'getCurrentDate', options: [
        opt('Add to a Date', 'addToDate'), opt('Extract Part of a Date', 'extractDate'), opt('Format a Date', 'formatDate'),
        opt('Get Current Date', 'getCurrentDate'), opt('Get Time Between Dates', 'getTimeBetweenDates'), opt('Subtract From a Date', 'subtractFromDate')] },
      { name: 'includeTime', displayName: 'Include Current Time', type: 'boolean', default: true, displayOptions: { show: { operation: ['getCurrentDate'] } } },
      { name: 'magnitude', displayName: 'Date to Add To', type: 'string', default: '', placeholder: 'e.g. 2024-03-15', displayOptions: { show: { operation: ['addToDate'] } } },
      { name: 'magnitude', displayName: 'Date to Subtract From', type: 'string', default: '', displayOptions: { show: { operation: ['subtractFromDate'] } } },
      { name: 'timeUnit', displayName: 'Time Unit to Add', type: 'options', default: 'days', options: TIME_UNITS.map((u) => opt(u[0].toUpperCase() + u.slice(1), u)), displayOptions: { show: { operation: ['addToDate', 'subtractFromDate'] } } },
      { name: 'duration', displayName: 'Duration', type: 'number', default: 0, displayOptions: { show: { operation: ['addToDate', 'subtractFromDate'] } } },
      { name: 'date', displayName: 'Date', type: 'string', default: '', displayOptions: { show: { operation: ['formatDate', 'extractDate'] } } },
      { name: 'format', displayName: 'Format', type: 'options', default: 'MM/dd/yyyy', displayOptions: { show: { operation: ['formatDate'] } }, options: [
        opt('Custom Format', 'custom'), opt('MM/DD/YYYY', 'MM/dd/yyyy'), opt('YYYY/MM/DD', 'yyyy/MM/dd'), opt('MMMM DD YYYY', 'MMMM dd yyyy'),
        opt('MM-DD-YYYY', 'MM-dd-yyyy'), opt('YYYY-MM-DD', 'yyyy-MM-dd'), opt('Unix Timestamp', 'X'), opt('Unix Ms Timestamp', 'x')] },
      { name: 'customFormat', displayName: 'Custom Format', type: 'string', default: '', placeholder: "e.g. yyyy-MM-dd 'at' HH:mm", displayOptions: { show: { operation: ['formatDate'], format: ['custom'] } } },
      { name: 'startDate', displayName: 'Start Date', type: 'string', default: '', displayOptions: { show: { operation: ['getTimeBetweenDates'] } } },
      { name: 'endDate', displayName: 'End Date', type: 'string', default: '', displayOptions: { show: { operation: ['getTimeBetweenDates'] } } },
      { name: 'units', displayName: 'Units', type: 'multiOptions', default: ['day'], displayOptions: { show: { operation: ['getTimeBetweenDates'] } }, options: [
        opt('Year', 'year'), opt('Month', 'month'), opt('Week', 'week'), opt('Day', 'day'), opt('Hour', 'hour'), opt('Minute', 'minute'), opt('Second', 'second'), opt('Millisecond', 'millisecond')] },
      { name: 'part', displayName: 'Part', type: 'options', default: 'month', displayOptions: { show: { operation: ['extractDate'] } }, options: [
        opt('Year', 'year'), opt('Month', 'month'), opt('Week', 'week'), opt('Day', 'day'), opt('Hour', 'hour'), opt('Minute', 'minute'), opt('Second', 'second')] },
      { name: 'outputFieldName', displayName: 'Output Field Name', type: 'string', default: 'currentDate', displayOptions: { show: { operation: ['getCurrentDate'] } } },
      { name: 'outputFieldName', displayName: 'Output Field Name', type: 'string', default: 'newDate', displayOptions: { show: { operation: ['addToDate', 'subtractFromDate'] } } },
      { name: 'outputFieldName', displayName: 'Output Field Name', type: 'string', default: 'formattedDate', displayOptions: { show: { operation: ['formatDate'] } } },
      { name: 'outputFieldName', displayName: 'Output Field Name', type: 'string', default: 'timeDifference', displayOptions: { show: { operation: ['getTimeBetweenDates'] } } },
      { name: 'outputFieldName', displayName: 'Output Field Name', type: 'string', default: 'datePart', displayOptions: { show: { operation: ['extractDate'] } } },
    ],
    async execute(ctx) {
      return [ctx.getInputData().map((item, i) => {
        const p = (n) => ctx.getNodeParameter(n, i);
        const op = p('operation');
        const parse = (v, label) => {
          const dt = DateTime.from(v);
          if (!dt.isValid) throw new NodeError(`The parameter '${label}' is not a valid date`, `Got '${stringifyValue(v)}'`);
          return dt;
        };
        let value;
        if (op === 'getCurrentDate') value = p('includeTime') ? DateTime.now().toISO() : DateTime.now().startOf('day').toISO();
        else if (op === 'addToDate' || op === 'subtractFromDate') {
          const dt = parse(p('magnitude'), op === 'addToDate' ? 'Date to Add To' : 'Date to Subtract From');
          const n = Number(p('duration')) || 0;
          value = (op === 'addToDate' ? dt.plus(n, p('timeUnit')) : dt.minus(n, p('timeUnit'))).toISO();
        } else if (op === 'formatDate') {
          const fmt = p('format') === 'custom' ? p('customFormat') : p('format');
          value = parse(p('date'), 'Date').toFormat(fmt);
          if (fmt === 'X' || fmt === 'x') value = Number(value);
        } else if (op === 'extractDate') {
          const dt = parse(p('date'), 'Date');
          value = p('part') === 'week' ? dt.weekNumber : dt[p('part')];
        } else if (op === 'getTimeBetweenDates') {
          const diff = parse(p('endDate'), 'End Date').diff(parse(p('startDate'), 'Start Date'));
          value = {};
          for (const u of p('units') || ['day']) value[`${u}s`] = diff.as(u);
        }
        const json = { ...item.json };
        setPath(json, p('outputFieldName'), value);
        return { json, pairedItem: { item: i } };
      })];
    },
  });

  define({
    type: 'n8n-nodes-base.crypto', version: 1, displayName: 'Crypto', name: 'Crypto', icon: 'key', color: '#408000', category: 'transform',
    description: 'Provide cryptographic utilities', subtitle: (p) => p.action,
    properties: [
      { name: 'action', displayName: 'Action', type: 'options', default: 'hash', options: [
        opt('Generate', 'generate', 'Generate random string'), opt('Hash', 'hash', 'Hash a text'), opt('Hmac', 'hmac', 'Hmac a text')] },
      { name: 'type', displayName: 'Type', type: 'options', default: 'MD5', displayOptions: { show: { action: ['hash'] } }, options: ['MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512'].map((t) => opt(t, t)) },
      { name: 'type', displayName: 'Type', type: 'options', default: 'SHA256', displayOptions: { show: { action: ['hmac'] } }, options: ['SHA1', 'SHA256', 'SHA384', 'SHA512'].map((t) => opt(t, t)) },
      { name: 'value', displayName: 'Value', type: 'string', default: '', displayOptions: { show: { action: ['hash', 'hmac'] } } },
      { name: 'secret', displayName: 'Secret', type: 'string', default: '', typeOptions: { password: true }, displayOptions: { show: { action: ['hmac'] } } },
      { name: 'dataPropertyName', displayName: 'Property Name', type: 'string', default: 'data', required: true },
      { name: 'encoding', displayName: 'Encoding', type: 'options', default: 'hex', displayOptions: { show: { action: ['hash', 'hmac'] } }, options: [opt('BASE64', 'base64'), opt('HEX', 'hex')] },
      { name: 'encodingType', displayName: 'Type', type: 'options', default: 'uuid', displayOptions: { show: { action: ['generate'] } }, options: [
        opt('ASCII', 'ascii'), opt('BASE64', 'base64'), opt('HEX', 'hex'), opt('UUID', 'uuid')] },
      { name: 'stringLength', displayName: 'Length', type: 'number', default: 32, displayOptions: { show: { action: ['generate'], encodingType: ['ascii', 'base64', 'hex'] } } },
    ],
    async execute(ctx) {
      const items = ctx.getInputData();
      const out = [];
      for (let i = 0; i < items.length; i++) {
        const p = (n) => ctx.getNodeParameter(n, i);
        let value;
        if (p('action') === 'generate') {
          const type = p('encodingType');
          if (type === 'uuid') value = uuid();
          else {
            const len = Number(p('stringLength')) || 32;
            const bytes = globalThis.crypto.getRandomValues(new Uint8Array(len));
            if (type === 'hex') value = toHex(bytes).slice(0, len);
            else if (type === 'base64') value = toBase64(bytes).slice(0, len);
            else value = Array.from(bytes, (b) => String.fromCharCode(33 + (b % 94))).join('');
          }
        } else if (p('action') === 'hash') value = encodeBytes(await hashValue(p('type'), p('value') ?? ''), p('encoding'));
        else value = encodeBytes(await hmacValue(p('type'), p('value') ?? '', p('secret') ?? ''), p('encoding'));
        const json = { ...items[i].json };
        setPath(json, p('dataPropertyName') || 'data', value);
        out.push({ json, pairedItem: { item: i } });
      }
      return [out];
    },
  });

  // ----- Apps -----

  define({
    type: 'n8n-nodes-base.telegram', version: 1.2, displayName: 'Telegram', name: 'Telegram', icon: 'telegram', color: '#0088cc', category: 'app',
    description: 'Sends data to Telegram', credentials: [{ name: 'telegramApi', required: true }],
    subtitle: (p) => `${p.operation === 'sendPhoto' ? 'sendPhoto' : 'sendMessage'}: message`,
    properties: [
      { name: 'resource', displayName: 'Resource', type: 'options', default: 'message', options: [opt('Message', 'message')] },
      { name: 'operation', displayName: 'Operation', type: 'options', default: 'sendMessage', options: [
        opt('Send Message', 'sendMessage', 'Send a text message'), opt('Send Photo', 'sendPhoto', 'Send a photo by URL')] },
      { name: 'chatId', displayName: 'Chat ID', type: 'string', default: '', required: true, description: 'Unique identifier for the target chat or username of the target channel (in the format @channelusername)' },
      { name: 'text', displayName: 'Text', type: 'string', default: '', required: true, typeOptions: { rows: 2 }, displayOptions: { show: { operation: ['sendMessage'] } } },
      { name: 'file', displayName: 'Photo', type: 'string', default: '', placeholder: 'https://example.com/image.png', displayOptions: { show: { operation: ['sendPhoto'] } } },
      { name: 'additionalFields', displayName: 'Additional Fields', type: 'collection', placeholder: 'Add Field', default: {}, options: [
        { name: 'caption', displayName: 'Caption', type: 'string', default: '' },
        { name: 'disable_notification', displayName: 'Disable Notification', type: 'boolean', default: false },
        { name: 'disable_web_page_preview', displayName: 'Disable WebPage Preview', type: 'boolean', default: false },
        { name: 'parse_mode', displayName: 'Parse Mode', type: 'options', default: 'HTML', options: [opt('HTML', 'HTML'), opt('Markdown (Legacy)', 'Markdown'), opt('MarkdownV2', 'MarkdownV2')] },
      ] },
    ],
    async execute(ctx) {
      const { accessToken } = await ctx.getCredentials('telegramApi');
      const items = ctx.getInputData();
      const out = [];
      for (let i = 0; i < items.length; i++) {
        const op = ctx.getNodeParameter('operation', i);
        const extra = ctx.getNodeParameter('additionalFields', i) || {};
        const body = { chat_id: ctx.getNodeParameter('chatId', i), ...extra };
        if (op === 'sendPhoto') body.photo = ctx.getNodeParameter('file', i);
        else body.text = ctx.getNodeParameter('text', i);
        if (op !== 'sendPhoto') delete body.caption;
        const res = await doRequest(ctx, { method: 'POST', url: `https://api.telegram.org/bot${accessToken}/${op}`, body });
        out.push({ json: res, pairedItem: { item: i } });
      }
      return [out];
    },
  });

  define({
    type: 'n8n-nodes-base.slack', version: 2.2, displayName: 'Slack', name: 'Slack', icon: 'slack', color: '#4A154B', category: 'app',
    description: 'Consume Slack API', credentials: [{ name: 'slackApi', required: true }], subtitle: () => 'post: message',
    properties: [
      { name: 'authentication', displayName: 'Authentication', type: 'options', default: 'accessToken', options: [opt('Access Token', 'accessToken')] },
      { name: 'resource', displayName: 'Resource', type: 'options', default: 'message', options: [opt('Message', 'message')] },
      { name: 'operation', displayName: 'Operation', type: 'options', default: 'post', options: [opt('Send', 'post')] },
      { name: 'select', displayName: 'Send Message To', type: 'options', default: 'channel', options: [opt('Channel', 'channel'), opt('User', 'user')] },
      { name: 'channelId', displayName: 'Channel', type: 'string', default: '', placeholder: '#general or C0123456', displayOptions: { show: { select: ['channel'] } } },
      { name: 'user', displayName: 'User', type: 'string', default: '', placeholder: 'U0123456', displayOptions: { show: { select: ['user'] } } },
      { name: 'text', displayName: 'Message Text', type: 'string', default: '', required: true, typeOptions: { rows: 2 } },
      { name: 'otherOptions', displayName: 'Options', type: 'collection', placeholder: 'Add option', default: {}, options: [
        { name: 'mrkdwn', displayName: 'Use Markdown?', type: 'boolean', default: true },
        { name: 'thread_ts', displayName: 'Reply to a Message (thread_ts)', type: 'string', default: '' },
        { name: 'unfurl_links', displayName: 'Unfurl Links', type: 'boolean', default: false },
      ] },
    ],
    async execute(ctx) {
      const { accessToken } = await ctx.getCredentials('slackApi');
      const items = ctx.getInputData();
      const out = [];
      for (let i = 0; i < items.length; i++) {
        const channel = ctx.getNodeParameter('select', i) === 'user' ? ctx.getNodeParameter('user', i) : ctx.getNodeParameter('channelId', i);
        const body = { channel: unwrapLocator(channel), text: ctx.getNodeParameter('text', i), ...(ctx.getNodeParameter('otherOptions', i) || {}) };
        const res = await doRequest(ctx, { method: 'POST', url: 'https://slack.com/api/chat.postMessage', headers: { Authorization: `Bearer ${accessToken}` }, body });
        if (res && res.ok === false) throw new NodeError(`Slack error response: ${JSON.stringify(res.error)}`);
        out.push({ json: res, pairedItem: { item: i } });
      }
      return [out];
    },
  });

  define({
    type: 'n8n-nodes-base.discord', version: 2, displayName: 'Discord', name: 'Discord', icon: 'discord', color: '#5865F2', category: 'app',
    description: 'Sends data to Discord', credentials: [{ name: 'discordWebhookApi', required: true }], subtitle: () => 'send: message',
    properties: [
      { name: 'authentication', displayName: 'Connection Type', type: 'options', default: 'webhook', options: [opt('Webhook', 'webhook')] },
      { name: 'operation', displayName: 'Operation', type: 'options', default: 'sendLegacy', options: [opt('Send a Message', 'sendLegacy')] },
      { name: 'content', displayName: 'Message', type: 'string', default: '', required: true, typeOptions: { rows: 2 } },
      { name: 'options', displayName: 'Options', type: 'collection', placeholder: 'Add option', default: {}, options: [
        { name: 'username', displayName: 'Username', type: 'string', default: '' },
        { name: 'avatar_url', displayName: 'Avatar URL', type: 'string', default: '' },
        { name: 'tts', displayName: 'TTS', type: 'boolean', default: false },
      ] },
    ],
    async execute(ctx) {
      const { webhookUri } = await ctx.getCredentials('discordWebhookApi');
      const items = ctx.getInputData();
      const out = [];
      for (let i = 0; i < items.length; i++) {
        const body = { content: ctx.getNodeParameter('content', i), ...(ctx.getNodeParameter('options', i) || {}) };
        const url = `${webhookUri}${webhookUri.includes('?') ? '&' : '?'}wait=true`;
        out.push({ json: await doRequest(ctx, { method: 'POST', url, body }), pairedItem: { item: i } });
      }
      return [out];
    },
  });

  // ----- AI -----

  const aiMessages = (defaultContent = '') => ({
    name: 'messages', displayName: 'Messages', type: 'fixedCollection', typeOptions: { multipleValues: true }, placeholder: 'Add Message',
    default: { values: [{ content: defaultContent, role: 'user' }] },
    options: [{ name: 'values', displayName: 'Values', values: [
      { name: 'content', displayName: 'Prompt', type: 'string', default: '', typeOptions: { rows: 2 } },
      { name: 'role', displayName: 'Role', type: 'options', default: 'user', options: [opt('User', 'user'), opt('Assistant', 'assistant'), opt('System', 'system')] },
    ] }],
  });

  define({
    type: '@n8n/n8n-nodes-langchain.openAi', version: 1.8, displayName: 'OpenAI', name: 'OpenAI', icon: 'sparkles', color: '#10a37f', category: 'ai',
    description: 'Message an assistant or GPT, analyze images, generate audio, etc.', credentials: [{ name: 'openAiApi', required: true }],
    subtitle: () => 'Message a model',
    properties: [
      { name: 'resource', displayName: 'Resource', type: 'options', default: 'text', options: [opt('Text', 'text')] },
      { name: 'operation', displayName: 'Operation', type: 'options', default: 'message', options: [opt('Message a Model', 'message')] },
      { name: 'modelId', displayName: 'Model', type: 'string', default: 'gpt-4o-mini', placeholder: 'e.g. gpt-4o-mini' },
      aiMessages(),
      { name: 'simplify', displayName: 'Simplify Output', type: 'boolean', default: true },
      { name: 'jsonOutput', displayName: 'Output Content as JSON', type: 'boolean', default: false },
      { name: 'options', displayName: 'Options', type: 'collection', placeholder: 'Add Option', default: {}, options: [
        { name: 'maxTokens', displayName: 'Maximum Number of Tokens', type: 'number', default: 1024 },
        { name: 'temperature', displayName: 'Output Randomness (Temperature)', type: 'number', default: 1 },
      ] },
    ],
    async execute(ctx) {
      const cred = await ctx.getCredentials('openAiApi');
      const base = String(cred.url || 'https://api.openai.com/v1').replace(/\/$/, '');
      const items = ctx.getInputData();
      const out = [];
      for (let i = 0; i < items.length; i++) {
        const messages = ((ctx.getNodeParameter('messages', i).values) || []).map((m) => ({ role: m.role || 'user', content: String(m.content ?? '') }));
        const options = ctx.getNodeParameter('options', i) || {};
        const jsonOutput = ctx.getNodeParameter('jsonOutput', i);
        const body = { model: unwrapLocator(ctx.getNodeParameter('modelId', i)), messages };
        if (options.maxTokens) body.max_completion_tokens = options.maxTokens;
        if (options.temperature !== undefined) body.temperature = options.temperature;
        if (jsonOutput) body.response_format = { type: 'json_object' };
        const res = await doRequest(ctx, { method: 'POST', url: `${base}/chat/completions`, headers: { Authorization: `Bearer ${cred.apiKey}` }, body });
        if (!ctx.getNodeParameter('simplify', i)) { out.push({ json: res, pairedItem: { item: i } }); continue; }
        for (const choice of res.choices || []) {
          const json = { ...choice };
          if (jsonOutput && json.message && typeof json.message.content === 'string') {
            try { json.message.content = JSON.parse(json.message.content); } catch { /* keep text */ }
          }
          out.push({ json, pairedItem: { item: i } });
        }
      }
      return [out];
    },
  });

  define({
    type: '@n8n/n8n-nodes-langchain.anthropic', version: 1, displayName: 'Anthropic', name: 'Anthropic', icon: 'anthropic', color: '#d97757', category: 'ai',
    description: 'Message Claude models', credentials: [{ name: 'anthropicApi', required: true }], subtitle: () => 'Message a model',
    properties: [
      { name: 'resource', displayName: 'Resource', type: 'options', default: 'text', options: [opt('Text', 'text')] },
      { name: 'operation', displayName: 'Operation', type: 'options', default: 'message', options: [opt('Message a Model', 'message')] },
      { name: 'modelId', displayName: 'Model', type: 'string', default: 'claude-opus-5-5', placeholder: 'e.g. claude-opus-5-5' },
      aiMessages(),
      { name: 'simplify', displayName: 'Simplify Output', type: 'boolean', default: true },
      { name: 'options', displayName: 'Options', type: 'collection', placeholder: 'Add Option', default: {}, options: [
        { name: 'system', displayName: 'System Message', type: 'string', default: '', typeOptions: { rows: 2 } },
        { name: 'maxTokens', displayName: 'Maximum Number of Tokens', type: 'number', default: 16000 },
        { name: 'fallbacks', displayName: 'Fall Back to Another Model on Refusal', type: 'boolean', default: true },
      ] },
    ],
    async execute(ctx) {
      const cred = await ctx.getCredentials('anthropicApi');
      const items = ctx.getInputData();
      const out = [];
      for (let i = 0; i < items.length; i++) {
        const options = ctx.getNodeParameter('options', i) || {};
        const all = ((ctx.getNodeParameter('messages', i).values) || []).map((m) => ({ role: m.role || 'user', content: String(m.content ?? '') }));
        const system = [options.system, ...all.filter((m) => m.role === 'system').map((m) => m.content)].filter(Boolean).join('\n\n');
        const body = {
          model: unwrapLocator(ctx.getNodeParameter('modelId', i)),
          max_tokens: Number(options.maxTokens) || 16000,
          messages: all.filter((m) => m.role !== 'system'),
        };
        if (system) body.system = system;
        const headers = { 'x-api-key': cred.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
        if (options.fallbacks !== false) {
          headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
          body.fallbacks = 'default';
        }
        const res = await doRequest(ctx, { method: 'POST', url: `${String(cred.url || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, headers, body, timeout: 600000 });
        if (res.stop_reason === 'refusal') {
          const d = res.stop_details || {};
          throw new NodeError('The model declined this request', [d.category, d.explanation].filter(Boolean).join(': '));
        }
        if (!ctx.getNodeParameter('simplify', i)) { out.push({ json: res, pairedItem: { item: i } }); continue; }
        const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        out.push({ json: { text, model: res.model, stop_reason: res.stop_reason, usage: res.usage }, pairedItem: { item: i } });
      }
      return [out];
    },
  });

  // ---------------------------------------------------------------------------
  // Credentials
  // ---------------------------------------------------------------------------

  const secret = (name, displayName, extra = {}) => ({ name, displayName, type: 'string', default: '', typeOptions: { password: true }, ...extra });
  const CREDENTIAL_TYPES = {
    httpBasicAuth: { displayName: 'Basic Auth', properties: [{ name: 'user', displayName: 'User', type: 'string', default: '' }, secret('password', 'Password')] },
    httpHeaderAuth: { displayName: 'Header Auth', properties: [{ name: 'name', displayName: 'Name', type: 'string', default: '', placeholder: 'Authorization' }, secret('value', 'Value')] },
    httpQueryAuth: { displayName: 'Query Auth', properties: [{ name: 'name', displayName: 'Name', type: 'string', default: '', placeholder: 'api_key' }, secret('value', 'Value')] },
    httpBearerAuth: { displayName: 'Bearer Auth', properties: [secret('token', 'Bearer Token')] },
    telegramApi: { displayName: 'Telegram API', icon: 'telegram', properties: [secret('accessToken', 'Access Token', { description: 'Chat with the bot father to obtain the access token' })] },
    slackApi: { displayName: 'Slack API', icon: 'slack', properties: [secret('accessToken', 'Access Token')] },
    discordWebhookApi: { displayName: 'Discord Webhook', icon: 'discord', properties: [secret('webhookUri', 'Webhook URL', { placeholder: 'https://discord.com/api/webhooks/...' })] },
    openAiApi: { displayName: 'OpenAI', icon: 'sparkles', properties: [secret('apiKey', 'API Key'), { name: 'url', displayName: 'Base URL', type: 'string', default: 'https://api.openai.com/v1' }] },
    anthropicApi: { displayName: 'Anthropic', icon: 'anthropic', properties: [secret('apiKey', 'API Key'), { name: 'url', displayName: 'Base URL', type: 'string', default: 'https://api.anthropic.com' }] },
  };

  // ---------------------------------------------------------------------------
  // Graph helpers
  // ---------------------------------------------------------------------------

  function getOutputNames(node) {
    const def = NODE_TYPES[node.type];
    if (!def) return ['main'];
    if (typeof def.outputs === 'function') return def.outputs(resolveProperties(def.properties, node.parameters));
    return def.outputs;
  }

  function getInputNames(node) {
    const def = NODE_TYPES[node.type];
    return def ? def.inputs : ['main'];
  }

  function isTriggerNode(node) {
    const def = NODE_TYPES[node.type];
    return def ? Boolean(def.trigger) : /trigger|webhook/i.test(node.type);
  }

  function parentsOf(workflow, name) {
    const out = [];
    for (const [from, conns] of Object.entries(workflow.connections || {})) {
      ((conns && conns.main) || []).forEach((list, outputIndex) => {
        (list || []).forEach((c) => { if (c.node === name) out.push({ node: from, outputIndex, inputIndex: c.index || 0 }); });
      });
    }
    return out;
  }

  function ancestorsOf(workflow, name) {
    const seen = new Set();
    const stack = [name];
    while (stack.length) {
      const n = stack.pop();
      for (const p of parentsOf(workflow, n)) if (!seen.has(p.node)) { seen.add(p.node); stack.push(p.node); }
    }
    return seen;
  }

  function nodeSubtitle(node) {
    const def = NODE_TYPES[node.type];
    if (!def || !def.subtitle) return '';
    try { return def.subtitle(resolveProperties(def.properties, node.parameters)); } catch { return ''; }
  }

  // ---------------------------------------------------------------------------
  // Expression context
  // ---------------------------------------------------------------------------

  function lastOutput(runData, name, outputIndex = 0) {
    const runs = runData[name];
    if (!runs || !runs.length) return null;
    const run = runs[runs.length - 1];
    return (run.data && run.data[outputIndex]) || [];
  }

  function makeExpressionContext(state, node, items, i, extra = {}) {
    const { runData, workflow, execution, nodesByName } = state;
    const item = items[i] || items[0] || { json: {} };
    const ref = (name) => {
      if (!nodesByName[name]) throw new Error(`Referenced node doesn't exist: "${name}"`);
      const out = lastOutput(runData, name);
      if (!out) throw new Error(`Referenced node is unexecuted: "${name}". An expression references this node, but it hasn't been executed yet.`);
      const pick = (idx) => out[Math.min(idx, out.length - 1)];
      return {
        get item() { return pick(i); }, first: () => out[0], last: () => out[out.length - 1], all: () => out,
        itemMatching: (idx) => pick(idx), params: nodesByName[name].parameters, isExecuted: true,
        get json() { return (pick(i) || {}).json; },
      };
    };
    const nodeProxy = typeof Proxy !== 'undefined'
      ? new Proxy({}, { get: (_, name) => { const r = ref(String(name)); return { json: (r.item || {}).json, data: (r.item || {}).json, parameter: r.params, runIndex: 0 }; } })
      : {};
    const now = DateTime.now();
    return {
      $json: item.json,
      $binary: item.binary || {},
      $input: { item, all: () => items, first: () => items[0], last: () => items[items.length - 1], params: node.parameters, context: {} },
      $: ref,
      $node: nodeProxy,
      $items: (name, outputIndex = 0) => (name ? lastOutput(runData, name, outputIndex) || [] : items),
      $item: (idx) => ({ $json: (items[idx] || {}).json, $node: nodeProxy }),
      $now: now,
      $today: now.startOf('day'),
      DateTime,
      $workflow: { id: workflow.id, name: workflow.name, active: Boolean(workflow.active) },
      $execution: { id: execution.id, mode: execution.mode === 'manual' ? 'test' : 'production', resumeUrl: '', customData: { set() {}, get() {} } },
      $prevNode: { name: extra.prevNode || '', outputIndex: 0, runIndex: 0 },
      $itemIndex: i,
      $runIndex: 0,
      $vars: {},
      $parameter: node.parameters,
      $position: i,
      $if: (c, a, b) => (c ? a : b),
      $ifEmpty: (v, d) => (isEmptyValue(v) ? d : v),
      $min: Math.min,
      $max: Math.max,
      ...extra.more,
    };
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  function normalizeOutput(result, count) {
    const outputs = Array.isArray(result) ? result : [[]];
    return Array.from({ length: Math.max(count, outputs.length) }, (_, k) => {
      const list = outputs[k] || [];
      return list.map((it) => (isObject(it) && isObject(it.json) ? it : { json: isObject(it) ? it : { data: it } }));
    });
  }

  async function runWorkflow(workflow, options = {}) {
    const evaluate = options.evaluate || defaultEvaluate;
    const runCode = options.runCode || defaultRunCode;
    const fetchFn = options.fetch || ((...a) => globalThis.fetch(...a));
    const nodes = (workflow.nodes || []).filter((n) => n.type !== 'n8n-nodes-base.stickyNote');
    const nodesByName = Object.fromEntries(nodes.map((n) => [n.name, n]));
    const runData = {};
    const execution = {
      id: options.executionId || uuid(),
      workflowId: workflow.id,
      workflowName: workflow.name,
      mode: options.mode || 'manual',
      status: 'running',
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      lastNodeExecuted: null,
      error: null,
      runData,
      workflowData: { nodes: clone(workflow.nodes || []), connections: clone(workflow.connections || {}) },
    };
    const state = { runData, workflow, execution, nodesByName };

    // Work out which nodes may run.
    let allowed = null;
    if (options.destinationNode) {
      if (!nodesByName[options.destinationNode]) throw new Error(`Node "${options.destinationNode}" does not exist`);
      allowed = ancestorsOf(workflow, options.destinationNode);
      allowed.add(options.destinationNode);
    }
    const canRun = (name) => nodesByName[name] && (!allowed || allowed.has(name));

    let start = options.startNode && nodesByName[options.startNode];
    if (!start) {
      const candidates = nodes.filter((n) => canRun(n.name) && !n.disabled && parentsOf(workflow, n.name).length === 0)
        .sort((a, b) => (a.position ? a.position[0] : 0) - (b.position ? b.position[0] : 0));
      start = candidates.find((n) => n.type === 'n8n-nodes-base.manualTrigger') || candidates.find(isTriggerNode) || candidates[0];
    }
    if (!start) {
      execution.status = 'error';
      execution.error = { message: 'The workflow has no nodes to execute', node: null };
      execution.stoppedAt = new Date().toISOString();
      return execution;
    }

    const stack = [{ name: start.name, input: [options.triggerItems || [{ json: {} }]], prevNode: null }];
    const waiting = new Map();

    async function executeNode(job) {
      const node = nodesByName[job.name];
      const def = NODE_TYPES[node.type];
      const inputs = job.input;
      const startTime = Date.now();
      const logs = [];
      const settings = { alwaysOutputData: node.alwaysOutputData, executeOnce: node.executeOnce, onError: node.onError || (node.continueOnFail ? 'continueRegularOutput' : 'stopWorkflow') };
      const run = { startTime, executionTime: 0, executionStatus: 'success', data: [], source: job.prevNode ? [{ previousNode: job.prevNode }] : [], inputCounts: inputs.map((x) => (x || []).length) };
      if (options.onNodeStart) options.onNodeStart(node.name);

      try {
        let outputs;
        if (node.disabled) outputs = [inputs[0] || []];
        else if (!def) throw new NodeError(`Unrecognized node type: ${node.type}`, 'This node is not supported in Flowlite yet.');
        else {
          const resolvedRoot = resolveProperties(def.properties, node.parameters);
          const getInput = (k = 0) => {
            const items = inputs[k] || [];
            return settings.executeOnce ? items.slice(0, 1) : items;
          };
          const ctx = {
            node, workflow, mode: execution.mode, fetch: fetchFn, maxWaitMs: options.maxWaitMs || 3600000,
            triggerItems: node.name === start.name ? options.triggerItems : undefined,
            getInputData: getInput,
            getNodeParameter(name, itemIndex = 0, fallback, opts = {}) {
              let raw = name === '' ? resolvedRoot : getPath(resolvedRoot, name);
              if (raw === undefined) raw = fallback;
              if (opts.raw) return raw === undefined ? raw : clone(raw);
              const items = getInput(0);
              const exprCtx = makeExpressionContext(state, node, items, itemIndex, { prevNode: job.prevNode });
              const value = resolveDeep(raw, exprCtx, evaluate);
              return isObject(value) && !value.__rl ? value : unwrapLocator(value);
            },
            async getCredentials(type) {
              const refCred = node.credentials && node.credentials[type];
              if (!refCred) throw new NodeError(`Node does not have any credentials set for "${CREDENTIAL_TYPES[type] ? CREDENTIAL_TYPES[type].displayName : type}"`, 'Open the node and select or create a credential.');
              if (!options.getCredential) throw new NodeError('Credentials are not available');
              const data = await options.getCredential(refCred, type);
              if (!data) throw new NodeError(`Credentials "${refCred.name || refCred.id}" could not be found`, 'They may have been deleted. Select a different credential in the node.');
              return data;
            },
            codeContext(items, i) {
              const base = makeExpressionContext(state, node, items, i, { prevNode: job.prevNode });
              const log = (...args) => logs.push(args.map((a) => (typeof a === 'string' ? a : stringifyValue(a))).join(' '));
              return {
                ...base,
                $input: { ...base.$input, item: items[i], all: () => items, first: () => items[0], last: () => items[items.length - 1] },
                items, item: items[i],
                console: { log, info: log, warn: log, error: log, debug: log },
                fetch: fetchFn,
              };
            },
            runCode(code, env) {
              const helpers = {
                httpRequest: (req) => doRequest({ fetch: fetchFn }, { ...req, qs: req.qs, body: req.body, returnFullResponse: req.returnFullResponse }),
              };
              return runCode(code, env, { helpers, getInputData: getInput, getNodeParameter: (n) => ctx.getNodeParameter(n, 0) });
            },
            respond(response) {
              execution.webhookResponse = response;
              if (options.respond) options.respond(response);
            },
          };
          const inputCount = (def.inputs || []).length;
          if (inputCount === 1 && !getInput(0).length && !def.trigger && !settings.alwaysOutputData) outputs = [[]];
          else outputs = await def.execute(ctx);
          outputs = normalizeOutput(outputs, getOutputNames(node).length);
        }
        if (settings.alwaysOutputData && outputs.every((o) => !o.length)) outputs[0] = [{ json: {} }];
        run.data = outputs;
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (settings.onError !== 'stopWorkflow' && settings.onError) {
          run.data = [[{ json: { error: message } }]];
        } else {
          run.executionStatus = 'error';
          run.error = { message, description: err.description || null, name: err.name };
          run.data = [];
        }
      }
      run.executionTime = Date.now() - startTime;
      if (logs.length) run.logs = logs;
      (runData[node.name] = runData[node.name] || []).push(run);
      execution.lastNodeExecuted = node.name;
      if (options.onNodeFinish) options.onNodeFinish(node.name, run);
      return run;
    }

    const connectedInputs = (name) => new Set(parentsOf(workflow, name).filter((p) => canRun(p.node)).map((p) => p.inputIndex));

    while (stack.length || waiting.size) {
      if (!stack.length) {
        // Nothing else can run: let a node waiting on several inputs run with what it has.
        const [name, inputs] = waiting.entries().next().value;
        waiting.delete(name);
        stack.push({ name, input: Array.from({ length: getInputNames(nodesByName[name]).length }, (_, k) => inputs[k] || []), prevNode: inputs.prevNode });
        continue;
      }
      const job = stack.shift();
      const run = await executeNode(job);
      if (run.executionStatus === 'error') {
        execution.status = 'error';
        execution.error = { message: run.error.message, description: run.error.description, node: job.name };
        break;
      }
      if (allowed && job.name === options.destinationNode) continue;
      const next = [];
      const conns = (workflow.connections[job.name] && workflow.connections[job.name].main) || [];
      conns.forEach((list, outputIndex) => {
        const items = run.data[outputIndex] || [];
        if (!items.length) return;
        for (const c of list || []) {
          if (!canRun(c.node)) continue;
          const target = nodesByName[c.node];
          const inputCount = getInputNames(target).length;
          if (inputCount <= 1) {
            next.push({ name: c.node, input: [items], prevNode: job.name });
          } else {
            const pending = waiting.get(c.node) || Object.assign([], { prevNode: job.name });
            pending[c.index || 0] = items;
            const needed = connectedInputs(c.node);
            if ([...needed].every((k) => pending[k])) {
              waiting.delete(c.node);
              next.push({ name: c.node, input: Array.from({ length: inputCount }, (_, k) => pending[k] || []), prevNode: job.name });
            } else waiting.set(c.node, pending);
          }
        }
      });
      stack.unshift(...next);
    }

    if (execution.status === 'running') execution.status = 'success';
    execution.stoppedAt = new Date().toISOString();
    return execution;
  }

  // Evaluates a parameter value for the editor's expression preview, using data from a previous run.
  function previewExpression(workflow, execution, nodeName, value, itemIndex = 0, evaluate) {
    const node = (workflow.nodes || []).find((n) => n.name === nodeName);
    if (!node) return { ok: false, error: 'Node not found' };
    const runData = (execution && execution.runData) || {};
    const parent = parentsOf(workflow, nodeName)[0];
    const items = parent ? lastOutput(runData, parent.node, parent.outputIndex) || [] : [];
    const state = { runData, workflow, execution: execution || { id: '', mode: 'manual' }, nodesByName: Object.fromEntries((workflow.nodes || []).map((n) => [n.name, n])) };
    try {
      const ctx = makeExpressionContext(state, node, items.length ? items : [{ json: {} }], itemIndex, { prevNode: parent && parent.node });
      return { ok: true, value: evaluateExpression(value, ctx, evaluate || defaultEvaluate) };
    } catch (err) {
      return { ok: false, error: err.description ? `${err.message}` : err.message };
    }
  }

  const CATEGORIES = [
    { id: 'ai', name: 'AI', description: 'Build autonomous agents, summarize or search documents, etc.', icon: 'sparkles' },
    { id: 'app', name: 'Action in an app', description: 'Do something in an app or service like Telegram or Slack', icon: 'globe' },
    { id: 'transform', name: 'Data transformation', description: 'Manipulate, filter or convert data', icon: 'pen' },
    { id: 'flow', name: 'Flow', description: 'Branch, merge or loop the flow, etc.', icon: 'if' },
    { id: 'core', name: 'Core', description: 'Run code, make HTTP requests, set webhooks, etc.', icon: 'code' },
  ];

  return {
    NODE_TYPES, CREDENTIAL_TYPES, CATEGORIES, OPERATORS, OPERATION_LABELS, SINGLE_VALUE_OPS,
    DateTime, NodeError, uuid, clone, getPath, setPath, isObject,
    runWorkflow, previewExpression, isExpression, evaluateFilter, defaultFilter,
    isPropertyVisible, resolveProperties, newNodeParameters, getOutputNames, getInputNames, isTriggerNode,
    parentsOf, ancestorsOf, nodeSubtitle, isScheduleDue, cronMatches, describeSchedule, md5: (s) => toHex(md5(new TextEncoder().encode(s))),
  };
});
