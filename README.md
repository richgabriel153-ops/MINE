# Flowlite

A small, self-hosted workflow automation app with an **n8n-style editor** that works on an iPhone.
It uses n8n's workflow JSON format, so you can paste workflows (or individual nodes) copied from n8n.
It has no dependencies: just Node.js.

## What's included

**Editor**: built to look and work like n8n's.
- Dotted canvas with nodes, connections and item counts. You can pan, pinch/scroll to zoom, drag nodes,
  and drag from an output to connect nodes.
- Use the **+** button on an output, the **+** in the corner, or Tab to open the node panel
  ("What happens next?") with categories and search.
- Node details view with **Input | Parameters | Output** panels: Schema / Table / JSON views, and
  *Fixed / Expression* toggles with a live **Result** preview. Drag fields from Input into a parameter
  to map them; on a phone, tap a parameter, then tap the field.
- **Test workflow**, **Test step** (runs up to that node), **Listen for test event** for webhooks,
  per-node Settings (Always Output Data, Execute Once, On Error, Notes) and deactivating nodes.
- Overview page with Workflows, Credentials and Executions; an Executions tab with read-only replays
  and *Debug in editor*; import, copy and paste of n8n JSON; Active toggle; Ctrl/⌘+S to save and
  Ctrl/⌘+Enter to run.

**Built-in nodes** (n8n type names and parameters):

| Group | Nodes |
| --- | --- |
| Triggers | Manual Trigger, Schedule Trigger (minutes/hours/days/weeks/months/cron), Webhook |
| Core | HTTP Request (query, headers, JSON/form/raw body, Basic/Bearer/Header/Query auth), Code (JavaScript), Respond to Webhook, RSS Read |
| Flow | If, Filter, Switch, Merge (append/combine/choose branch), Wait, No Operation |
| Data transformation | Edit Fields (Set), Split Out, Aggregate, Limit, Sort, Remove Duplicates, Date & Time, Crypto |
| Apps | Telegram, Slack, Discord |
| AI | OpenAI (chat), Anthropic (Claude) |

**Expressions**: `{{ }}` with `$json`, `$input.all()/first()/item`, `$('Node Name').item.json`,
`$node["Name"].json`, `$now` / `$today` (Luxon-style `toFormat`, `plus`, `minus`…), `$workflow`,
`$execution`, `$itemIndex`, `$if`, `$ifEmpty`.

**Not included**: n8n's hundreds of other app integrations (use HTTP Request or Code instead), Loop
Over Items, sub-workflows, binary files, OAuth credentials, and user accounts or sharing.
Unsupported nodes in imported workflows are shown with a dashed border and report an error when run.

## Run it

```sh
APP_PASSWORD=choose-a-password npm start   # http://localhost:3000
npm test
npm run build:preview                      # single-file, in-browser demo → dist/flowlite-preview.html
```

The in-browser preview runs everything locally and saves to the browser's storage. It can't receive
webhooks or call outside APIs.

## Deploy (so your iPhone can reach it 24/7)

Any host that runs a Docker container with a persistent disk works. Data lives in `/data`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_PASSWORD` | yes | Password for the app. The server won't start in production without it. |
| `TZ` | no | Time zone for schedules, e.g. `America/New_York` (default UTC). |
| `ENCRYPTION_KEY` | no | Key for encrypting credentials. By default it is derived from `APP_SECRET` or the password. If you change it, saved credentials must be re-entered. |
| `WEBHOOK_URL` | no | Public base URL shown for webhooks, if the automatic one is wrong behind a proxy. |
| `PORT` | no | Defaults to `3000`. |

**Railway**: New project → *Deploy from GitHub repo* → set `APP_PASSWORD` (and `TZ`) → add a *Volume*
mounted at `/data` → *Settings → Networking → Generate Domain*.

**Any VPS**:
```sh
docker build -t flowlite .
docker run -d --restart unless-stopped -p 3000:3000 \
  -e APP_PASSWORD=choose-a-password -e TZ=America/New_York -v flowlite-data:/data flowlite
```
Put it behind HTTPS, for example with Caddy: `caddy reverse-proxy --from your.domain --to :3000`.

Then open the URL in **Safari → Share → Add to Home Screen**.

## Security notes

- Everything except webhooks and the sign-in page requires the password.
- Credentials are encrypted at rest (AES-256-GCM) and never sent back to the browser in full.
- Expressions and Code nodes run on the server with a timeout. They are not sandboxed, so anyone with
  the password can run code on the server. Only share it with people you trust.

## Project layout

```
server.js            HTTP server: REST API, webhooks (/webhook, /webhook-test), scheduler
store.js             JSON-file storage in DATA_DIR
public/engine.js     Workflow engine + node definitions (shared by server and browser)
public/app.js        Overview, editor, executions, node panel, credentials
public/canvas.js     Canvas and graph editing
public/ndv.js        Node details view and parameter editors
public/backend.js    Server API client, and the in-browser backend used by the preview
scripts/build-preview.js
test/                node --test suites
```
