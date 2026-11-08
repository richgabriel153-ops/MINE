// Linkup signaling + matchmaking server.
//
// Responsibilities:
//   - keep a FIFO queue of people waiting for a stranger
//   - pair two people and tell exactly one of them to create the WebRTC offer
//   - relay offer / answer / ICE candidates between the two (never media)
//   - clean up when someone skips, stops, refreshes or drops off the network
//   - report how many people are online
//
// Protocol (JSON over WebSocket):
//   client -> server  { type: "hello", sessionId }
//                     { type: "find" }                 join the queue
//                     { type: "next" }                 leave current stranger + join queue
//                     { type: "stop" }                 leave current stranger + leave queue
//                     { type: "signal", matchId, data } WebRTC description / candidate
//   server -> client  { type: "welcome", id, iceServers, online }
//                     { type: "online", count }
//                     { type: "waiting" }
//                     { type: "matched", matchId, initiator, partnerSessionId }
//                     { type: "signal", matchId, data }
//                     { type: "partner-left", matchId, reason }   reason: skipped | stopped | disconnected
//                     { type: "error", message }

import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT) || 8080;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const HEARTBEAT_MS = 15_000; // a socket that misses one ping/pong round is dropped
const REMATCH_COOLDOWN_MS = 4_000; // don't instantly re-pair the two people who just split
const MATCH_SWEEP_MS = 1_000; // retry pairing people the cooldown held back
const MAX_MSGS_PER_10S = 200; // ICE gathering can be chatty; this only stops floods

// ---------------------------------------------------------------- ICE config

function buildIceServers() {
  const servers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turnUrls = (process.env.TURN_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (turnUrls.length) {
    servers.push({
      urls: turnUrls,
      username: process.env.TURN_USERNAME || undefined,
      credential: process.env.TURN_CREDENTIAL || undefined,
    });
  }
  return servers;
}
const ICE_SERVERS = buildIceServers();

// ---------------------------------------------------------------- state

/** @typedef {{ id: string, ws: import("ws").WebSocket, sessionId: string|null, alive: boolean,
 *   partner: Client|null, matchId: string|null, queuedAt: number|null,
 *   lastPartnerId: string|null, lastSplitAt: number, msgCount: number, msgWindow: number }} Client */

/** @type {Map<string, Client>} */
const clients = new Map();
/** @type {Client[]} */
let queue = [];

const send = (client, msg) => {
  if (client.ws.readyState === client.ws.OPEN) client.ws.send(JSON.stringify(msg));
};

const onlineCount = () => {
  let n = 0;
  for (const c of clients.values()) if (c.sessionId) n++;
  return n;
};

let onlineTimer = null;
let lastBroadcastCount = -1;
function scheduleOnlineBroadcast() {
  if (onlineTimer) return;
  onlineTimer = setTimeout(() => {
    onlineTimer = null;
    const count = onlineCount();
    if (count === lastBroadcastCount) return;
    lastBroadcastCount = count;
    for (const c of clients.values()) if (c.sessionId) send(c, { type: "online", count });
  }, 500);
}

// ---------------------------------------------------------------- matchmaking

function removeFromQueue(client) {
  if (client.queuedAt === null) return;
  queue = queue.filter((c) => c !== client);
  client.queuedAt = null;
}

function recentlySplit(a, b, now) {
  const recent = (x, y) => x.lastPartnerId === y.id && now - x.lastSplitAt < REMATCH_COOLDOWN_MS;
  return recent(a, b) || recent(b, a);
}

function pair(a, b) {
  removeFromQueue(a);
  removeFromQueue(b);
  const matchId = crypto.randomUUID();
  a.partner = b;
  b.partner = a;
  a.matchId = b.matchId = matchId;
  // The person who waited longer makes the offer; exactly one side does, so offers never collide.
  send(a, { type: "matched", matchId, initiator: true, partnerSessionId: b.sessionId });
  send(b, { type: "matched", matchId, initiator: false, partnerSessionId: a.sessionId });
}

/** Walk the queue in arrival order and pair everyone who can be paired. */
function runMatching() {
  const now = Date.now();
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i];
    for (let j = i + 1; j < queue.length; j++) {
      const b = queue[j];
      if (a.sessionId === b.sessionId) continue; // same tab reconnecting; never pair with yourself
      if (recentlySplit(a, b, now)) continue;
      pair(a, b); // mutates queue
      i = -1; // restart: indexes moved
      break;
    }
  }
}

function enqueue(client) {
  if (client.partner) return;
  if (client.queuedAt === null) {
    client.queuedAt = Date.now();
    queue.push(client);
  }
  send(client, { type: "waiting" });
  runMatching();
}

/** End the client's current pair, telling the stranger why. */
function leavePartner(client, reason) {
  const partner = client.partner;
  if (!partner) return;
  const now = Date.now();
  send(partner, { type: "partner-left", matchId: client.matchId, reason });
  partner.partner = null;
  partner.matchId = null;
  partner.lastPartnerId = client.id;
  partner.lastSplitAt = now;
  client.partner = null;
  client.matchId = null;
  client.lastPartnerId = partner.id;
  client.lastSplitAt = now;
}

function drop(client, reason) {
  if (!clients.has(client.id)) return;
  clients.delete(client.id);
  removeFromQueue(client);
  leavePartner(client, reason);
  scheduleOnlineBroadcast();
}

// ---------------------------------------------------------------- message handling

function handle(client, raw) {
  const now = Date.now();
  if (now - client.msgWindow > 10_000) {
    client.msgWindow = now;
    client.msgCount = 0;
  }
  if (++client.msgCount > MAX_MSGS_PER_10S) {
    send(client, { type: "error", message: "Too many messages" });
    client.ws.close(1008, "rate limit");
    return;
  }

  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "hello") {
    const sessionId = typeof msg.sessionId === "string" ? msg.sessionId.slice(0, 64) : "";
    if (!sessionId) return;
    // A tab that refreshed mid-call reconnects with the same session ID before its old socket
    // has timed out. Drop the stale socket now so its stranger is told right away.
    for (const other of clients.values()) {
      if (other !== client && other.sessionId === sessionId) {
        drop(other, "disconnected");
        other.ws.terminate();
      }
    }
    client.sessionId = sessionId;
    send(client, { type: "welcome", id: client.id, iceServers: ICE_SERVERS, online: onlineCount() });
    scheduleOnlineBroadcast();
    return;
  }

  if (!client.sessionId) return; // must say hello first

  switch (msg.type) {
    case "find":
      enqueue(client);
      break;
    case "next":
      leavePartner(client, "skipped");
      enqueue(client);
      break;
    case "stop":
      leavePartner(client, "stopped");
      removeFromQueue(client);
      break;
    case "signal":
      // Only relay inside the current pair. Late candidates from an earlier stranger are dropped.
      if (client.partner && msg.matchId === client.matchId && msg.data) {
        send(client.partner, { type: "signal", matchId: client.matchId, data: msg.data });
      }
      break;
    case "ping":
      send(client, { type: "pong" });
      break;
  }
}

// ---------------------------------------------------------------- HTTP + WS

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  const url = (req.url || "/").split("?")[0];
  if (url === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ online: onlineCount(), waiting: queue.length }));
    return;
  }
  if (url === "/" || url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({
  server,
  maxPayload: 64 * 1024,
  verifyClient: ({ origin }) =>
    ALLOWED_ORIGINS.length === 0 || (origin && ALLOWED_ORIGINS.includes(origin)),
});

wss.on("connection", (ws) => {
  /** @type {Client} */
  const client = {
    id: crypto.randomUUID(),
    ws,
    sessionId: null,
    alive: true,
    partner: null,
    matchId: null,
    queuedAt: null,
    lastPartnerId: null,
    lastSplitAt: 0,
    msgCount: 0,
    msgWindow: Date.now(),
  };
  clients.set(client.id, client);

  ws.on("pong", () => (client.alive = true));
  ws.on("message", (raw) => handle(client, raw));
  ws.on("close", () => drop(client, "disconnected"));
  ws.on("error", () => drop(client, "disconnected"));
});

// Heartbeat: catches phones that lost signal or closed the tab without a clean close frame.
const heartbeat = setInterval(() => {
  for (const client of clients.values()) {
    if (!client.alive) {
      drop(client, "disconnected");
      client.ws.terminate();
      continue;
    }
    client.alive = false;
    try {
      client.ws.ping();
    } catch {}
  }
}, HEARTBEAT_MS);

// People held back by the rematch cooldown get paired once it expires.
const sweep = setInterval(() => {
  if (queue.length > 1) runMatching();
}, MATCH_SWEEP_MS);

server.listen(PORT, () => {
  console.log(`Linkup server listening on :${PORT}`);
  console.log(`TURN ${ICE_SERVERS.length > 1 ? "configured" : "not configured (STUN only)"}`);
});

function shutdown() {
  clearInterval(heartbeat);
  clearInterval(sweep);
  for (const c of clients.values()) c.ws.close(1001, "server restarting");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
