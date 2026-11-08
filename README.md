# Linkup: random 1-on-1 video chat (v1)

Mobile-first web app that pairs two strangers for a live video chat, like Omegle or Tagoo.

```
/web       Next.js 15 (App Router) + TypeScript + Tailwind v4  → deploy to Vercel
/server    Node.js + ws signaling / matchmaking server          → deploy to Render or Railway
/supabase  SQL for the reports table
```

**How it works**

- Video and audio go **peer-to-peer over WebRTC**. The server never sees media.
- The **server** keeps a FIFO waiting queue and pairs people. It tells exactly one side to make the
  offer, relays offer, answer and ICE candidates, and broadcasts the online count. It also cleans up
  on Next, Stop, refresh and dropped connections.
- **Text chat** goes over a WebRTC data channel. Mic and camera state go over the same channel, so the
  stranger sees "camera off" instead of a black frame.
- **Reports** are posted to a Next.js API route (`/web/app/api/report/route.ts`), which writes to
  Supabase with the service role key on the server. The browser never gets database credentials.
- **No accounts.** Each browser tab gets an anonymous session ID in `sessionStorage`. It survives a
  refresh, but two tabs get different IDs so you can test with two tabs. The 18+ confirmation lives in
  `localStorage`.

## Local setup

Requirements: Node 18+ (20+ recommended).

```bash
# 1. Signaling server
cd server
npm install
cp .env.example .env        # optional; defaults work locally
npm run dev                 # → ws://localhost:8080  (GET /stats shows online count)

# 2. Web app (second terminal)
cd web
npm install
cp .env.example .env.local  # NEXT_PUBLIC_SIGNALING_URL=ws://localhost:8080
npm run dev                 # → http://localhost:3000
```

The server reads `.env` only if your process manager loads it. Locally the defaults are enough, so
you can also just run `PORT=8080 npm start`.

Supabase is optional locally. Without `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, the dev server
logs reports to the terminal and returns success, so the whole report → skip flow still works. In
production a missing config returns a 503 and the user sees "Couldn't send the report".

### Test matching with two browser tabs

1. Open http://localhost:3000, tick the 18+ box and press **Start chatting**.
2. Allow camera and mic, then press **Find a stranger**. You'll see **Waiting for someone…** and "You're
   the only one online right now".
3. Open a **second tab** at http://localhost:3000/chat (the 18+ box is remembered). Allow camera, then
   press **Find a stranger**.
4. Both tabs connect within a second or two. Each shows the other's video large and its own small.
   Type in the chat box to send messages between tabs.
5. Try the edge cases:
   - **Next** in one tab: the other shows **Stranger left** with a "Find someone new" button.
     The two tabs re-pair after a short 4-second cooldown, which stops the same two people bouncing
     straight back together when others are online.
   - Press **Next in both tabs at once**: both go back to waiting and re-pair after the cooldown.
   - **Refresh** one tab mid-call: the other tab is told immediately. The refreshed tab turns the
     camera back on and rejoins the queue by itself.
   - **Report**: pick a reason. The reporter is skipped to the queue right away and the report is saved.
   - **Stop**: you leave the queue. **Start again** rejoins.

Tips:

- Both tabs share one physical camera. Chrome and Firefox allow that. Some Windows camera drivers
  don't; use two browsers, or Chrome's fake camera:
  `chrome --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- Turn your volume down or mute one tab, or you'll get audio feedback.
- To test on a **phone**, the page must be served over HTTPS (browsers block cameras on plain http,
  except on localhost). Use a tunnel such as `cloudflared tunnel --url http://localhost:3000`, and
  tunnel the server too (`--url http://localhost:8080`, then use its `wss://` URL in
  `NEXT_PUBLIC_SIGNALING_URL`).

## Environment variables

**server/.env.example**

| Var | Purpose |
| --- | --- |
| `PORT` | Port to listen on. Render and Railway set this. |
| `ALLOWED_ORIGINS` | Comma-separated browser origins allowed to connect, e.g. `https://linkup.vercel.app`. Empty allows all (dev). |
| `TURN_URL` | Optional TURN URL(s), comma-separated. |
| `TURN_USERNAME`, `TURN_CREDENTIAL` | TURN credentials. |

Google's public STUN server is always included. TURN details are sent to clients over the socket
at connect time, so you can change them without rebuilding the frontend.

**web/.env.example**

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SIGNALING_URL` | `ws://localhost:8080` locally, `wss://<your-server>` in production. |
| `SUPABASE_URL` | Supabase project URL (server-side only). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only; never prefix with `NEXT_PUBLIC_`). |

### Adding TURN later

About 10–20% of users, mostly on mobile carriers and strict corporate networks, can't connect
peer-to-peer with STUN alone. Linkup times out after 20 s and moves them on. TURN fixes this.

- **Cloudflare Realtime TURN:** create a TURN key in the Cloudflare dashboard, then generate
  credentials. Set `TURN_URL=turn:turn.cloudflare.com:3478?transport=udp,turn:turn.cloudflare.com:3478?transport=tcp,turns:turn.cloudflare.com:5349?transport=tcp`
  with the generated username and credential.
- **metered.ca:** create an app and copy the static credentials. Set
  `TURN_URL=turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:443?transport=tcp,turns:global.relay.metered.ca:443?transport=tcp`.

Both providers also offer short-lived credentials through an API; v1 uses static ones.

## Supabase: create the reports table

1. Create a project at https://supabase.com.
2. Open **SQL Editor → New query**, paste the SQL below (also in `supabase/reports.sql`) and **Run**.
3. In **Project Settings → API**, copy the **Project URL** into `SUPABASE_URL` and the
   **service_role** key into `SUPABASE_SERVICE_ROLE_KEY` (Vercel env vars, or `web/.env.local`).

```sql
create table if not exists public.reports (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  reporter_session_id   text not null,
  reported_session_id   text,
  match_id              text,
  reason                text not null check (reason in ('nudity', 'harassment', 'underage', 'spam', 'other')),
  note                  text check (char_length(note) <= 500)
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_reported_session_idx on public.reports (reported_session_id);

-- Writes go through the Next.js API route with the service role key (bypasses RLS).
-- With RLS on and no policies, the public anon key can neither read nor write reports.
alter table public.reports enable row level security;
```

Read reports in **Table Editor → reports**, or with SQL:
`select reason, count(*) from reports group by 1;`

## Deploy

### Server → Render

1. Push this repo to GitHub.
2. Render → **New → Web Service** → pick the repo.
3. **Root Directory:** `server` · **Runtime:** Node · **Build Command:** `npm install` ·
   **Start Command:** `npm start`
4. Environment: `ALLOWED_ORIGINS=https://<your-app>.vercel.app` (add custom domains too) and the TURN
   vars if you have them.
5. Deploy. Your signaling URL is `wss://<service>.onrender.com`. Check
   `https://<service>.onrender.com/stats` returns `{"online":0,...}`.

Render's free tier sleeps after 15 minutes idle; the first visitor then waits about 30 s. Use a paid
instance for real traffic. Keep it to **one instance**: the queue lives in memory (see Limits).

### Server → Railway (alternative)

New Project → Deploy from GitHub repo → set **Root Directory** to `server`. Railway detects Node and
runs `npm start`. Add the same env vars, then **Settings → Networking → Generate Domain**. Use
`wss://<domain>`.

### Frontend → Vercel

1. Vercel → **Add New → Project** → import the repo.
2. **Root Directory:** `web` (framework auto-detects as Next.js).
3. Environment variables:
   - `NEXT_PUBLIC_SIGNALING_URL=wss://<your-server-domain>`
   - `SUPABASE_URL=...`
   - `SUPABASE_SERVICE_ROLE_KEY=...`
4. Deploy, then put the Vercel URL into the server's `ALLOWED_ORIGINS` and redeploy the server.

## Project layout

```
server/src/index.js          queue, pairing, signaling relay, heartbeat, /stats
web/app/page.tsx             landing (pitch, 18+ checkbox, online counter)
web/app/chat/page.tsx        permission → waiting → call flow, report submit
web/app/terms/page.tsx       community rules
web/app/api/report/route.ts  validates and inserts reports into Supabase
web/lib/useLinkup.ts         signaling socket + RTCPeerConnection + data channel state machine
web/lib/session.ts           anonymous session ID, 18+ flag, resume-after-refresh flag
web/components/              CallScreen, ChatPanel, PermissionScreen, ReportModal, …
supabase/reports.sql         reports table
```

## Edge cases handled

| Case | Behaviour |
| --- | --- |
| No one else online | "Waiting for someone…" with an "only one online" note; matches when someone joins. |
| Partner presses Next, Stop or closes the tab | Other side sees **Stranger left** with the reason and a Next button. |
| Refresh mid-call | `pagehide` closes the socket, so the partner is told immediately. The same tab reconnects with its session ID, the server drops any stale socket, and the tab rejoins the queue. |
| Both press Next at once | Each request is handled separately; neither gets stuck. A 4 s cooldown stops instant re-pairing. |
| Late ICE candidates from a previous stranger | Every signal carries a `matchId`; the server and client drop mismatches. |
| Slow or unstable network | Modest 640×480 at 24 fps video; "Weak connection…" chip when ICE disconnects; a 20 s connect timeout auto-skips; heartbeat drops dead sockets after about 15–30 s; the signaling socket reconnects with backoff and on `online`. |
| Camera denied, missing, busy or insecure | Specific message for each with recovery steps and **Try again**. |
| Stop pressed while the server was pairing you | Client releases the match immediately. |
| Autoplay with sound blocked | "Tap to turn on sound" button. |

## Limits of v1 (worth knowing)

- **Single server instance.** The queue is in memory. To scale out, move the queue and pairs to
  Redis (pub/sub for relaying) or use sticky sessions with a shared queue.
- **Reports are trust-based.** The reported session ID comes from the server-assigned pairing, but
  the report request itself is not signed. Add a server-issued token per match if abuse appears.
- **No bans yet.** Reports are stored. Acting on them (blocking session IDs or IPs at the signaling
  server) is the natural v2 step.
- **No automated moderation** of video content.
