# Flowlite

A tiny, zero-dependency workflow automation app in the spirit of n8n, built to be used from an iPhone.

It runs on a small server (so workflows keep running when your phone is locked) and you use it
through a mobile web app that you add to your home screen.

## What it does

A **workflow** is a trigger followed by a list of steps.

**Triggers**
- **Manual** – tap ▶ Run in the app.
- **Webhook** – each workflow gets its own secret URL. Call it from anything (Shortcuts, IFTTT, another
  service). The last step's output is returned as the response.
- **Schedule** – every N minutes, or every day at a set time.

**Steps**
- **HTTP Request** – call any API (GET/POST/PUT/PATCH/DELETE, headers, body).
- **Set data** – build a JSON object from earlier data.
- **Code** – run JavaScript and return a value (`fetch` is available).
- **Filter / If** – stop unless a condition is true.
- **Wait** – pause up to 300 seconds.

**Expressions.** Any text field can contain `{{ … }}` JavaScript expressions:

| Name | Meaning |
| --- | --- |
| `json` | Output of the previous step |
| `steps["Step name"]` | Output of any earlier step, by name |
| `trigger` | Trigger data (for webhooks: `method`, `query`, `headers`, `body`) |
| `now` | Current time as an ISO string |

Example: URL `https://api.example.com/users/{{ trigger.body.id }}`, condition `json.body.price < 100`.

Every run is saved (last 200) with each step's output, so you can see what happened from your phone.

## Run it locally

Needs Node.js 18 or newer. There is nothing to install.

```sh
APP_PASSWORD=choose-a-password npm start
# open http://localhost:3000
npm test
```

## Deploy (so your iPhone can reach it 24/7)

Any host that can run a Docker container with a persistent disk works. The image stores everything
in `/data`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_PASSWORD` | yes | Password for the app. The server won't start in production without it. |
| `TZ` | no | Time zone for daily schedules, e.g. `America/New_York`. Defaults to UTC. |
| `APP_SECRET` | no | Signs login cookies. Defaults to a value derived from the password. |
| `PORT` | no | Defaults to `3000`. |

**Railway (easiest)**
1. Create a new project → *Deploy from GitHub repo* → pick this repo. Railway finds the `Dockerfile`.
2. Under *Variables*, add `APP_PASSWORD` (and `TZ`).
3. Add a *Volume* mounted at `/data` so your workflows survive redeploys.
4. Under *Settings → Networking*, click *Generate Domain*.

**Any VPS (Hetzner, DigitalOcean, …)**
```sh
docker build -t flowlite .
docker run -d --restart unless-stopped -p 3000:3000 \
  -e APP_PASSWORD=choose-a-password -e TZ=America/New_York \
  -v flowlite-data:/data flowlite
```
Put it behind HTTPS (for example Caddy: `caddy reverse-proxy --from your.domain --to :3000`).

> Hosts with no persistent disk (such as Render's free tier) will wipe your workflows on every
> redeploy, and free instances that go to sleep won't run schedules.

## Put it on your iPhone

1. Open your deployed URL in **Safari** and sign in.
2. Tap **Share → Add to Home Screen**.
3. It now opens full screen like a normal app.

Tip: the **Shortcuts** app can call a webhook URL ("Get Contents of URL"), so you can start workflows
from Siri, an automation, or a home-screen button.

## Security notes

- Everything except webhooks and the login page requires the password.
- Webhook URLs contain a random 24-character ID. Treat them like passwords.
- Code steps and expressions run with full server access (`node:vm` is not a sandbox). That is fine
  for a single owner, but don't share your password with people you don't trust.

## Project layout

```
server.js   HTTP server, REST API, webhooks, scheduler
engine.js   Runs workflows: expressions and step types
store.js    JSON-file storage in DATA_DIR
public/     Mobile web app (no build step)
test/       node --test suites
```
