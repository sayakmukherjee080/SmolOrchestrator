<p align="center">
  <img src="assets/smolorchestrator_logo.png" width="150" alt="SmolOrchestrator Logo">
</p>

> **The Lightweight, Zero-Dependency AI Gateway.**  
> *One key. Many providers. Total control — without the stack.*

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-22.13%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Status](https://img.shields.io/badge/Status-v2.0-success)]()

---

## 🚀 Why SmolOrchestrator?

SmolOrchestrator is a self-hosted AI gateway built for people who want **LiteLLM-style orchestration without the LiteLLM stack**. No Docker, no Postgres, no Redis, no Python, no package managers. One Node process, one SQLite file, one dashboard.

Point any OpenAI-compatible client at your gateway: it sees the models you allow, and everything else — balancing, key rotation, failover, cooldowns, recovery, caching, budgets, and telemetry — happens under the hood.

### ✨ Key Features

*   **Zero Dependencies**: No runtime npm packages. No database server. `node:sqlite` is built in, the rest is standard library.
*   **One Key, Many Models**: Clients authenticate with a gateway key scoped to exactly the models they may use.
*   **Smart Routing**: Priority tiers with `round_robin`, `least_used`, or `cache_aware` balancing per model.
*   **Cache-Aware Stickiness**: Pin each client key to one provider route and exact key so upstream prompt caches keep hitting — reroute only on failure.
*   **Key Pools**: Multiple upstream keys per provider, rotated round-robin; `401`/`403` benches a key automatically.
*   **Failover That Recovers**: Capped exponential backoff on failures, active "ping" probes to bring routes back, and proactive health checks before users see errors.
*   **Budgets & Quotas**: Per-token daily/monthly request and spend budgets, optional per-route daily caps, and soft-limit warnings.
*   **Response Cache + Singleflight**: Deterministic (`temperature: 0`) requests are cached and concurrent duplicates collapse into one upstream call.
*   **Prompt-Cache Savings**: Provider cached-token counts are parsed and priced, so the dashboard shows what caching actually saved you.
*   **Capability-Aware Routing**: Routes declare `tools`, `vision`, `audio`, `json`, `reasoning`, and max context; incompatible routes are skipped before you waste a request.
*   **Transparent Proxy**: Byte-for-byte passthrough, streaming included. The only request mutations are the upstream model name and usage-tracking options.
*   **Observability Without Content**: Attempt-level telemetry, per-day usage, latency percentiles, and Prometheus metrics — prompts and completions are never stored.
*   **Modern Admin UI**: Light/dark, minimal, micro-animated. No CDN assets, no build step.
*   **Backups & Config Transfer**: Scheduled SQLite snapshots plus JSON config export/import for moving between boxes.

---

## 🛠️ Tech Stack

*   **Backend**: Node.js 22.13+ (pure functionality, no web framework)
*   **Database**: SQLite 3 via `node:sqlite` (portable, zero-config, WAL)
*   **Frontend**: Vanilla JS (ES modules) + hand-rolled CSS design tokens (light/dark)
*   **Security**: scrypt passwords, signed HttpOnly sessions, CSRF tokens, AES-256-GCM encrypted provider keys, audit trail.

### Requirements

*   Node.js **22.13 or newer** (needed for `node:sqlite`).
*   Nothing else. No Postgres, Redis, Docker, or Python. No cron daemon required — background jobs run in-process.
*   The original PHP implementation lives under [`legacy/`](legacy/) for reference.

---

## 🕰️ Background Jobs (Built In)

There is no worker script to schedule. The process owns its own timers:

*   telemetry flush to SQLite every `TELEMETRY_FLUSH_MS`,
*   recovery probes for cooling routes,
*   proactive health checks on `HEALTH_CHECK_INTERVAL_MS`,
*   scheduled backups on `BACKUP_INTERVAL_MS`,
*   graceful shutdown (drain, flush, close) on `SIGTERM`/`SIGINT`.

---

## 🔌 Compatibility

SmolOrchestrator is a transparent proxy; any provider that speaks the OpenAI API works.

| Provider | Status | Notes |
| :--- | :---: | :--- |
| **OpenAI** | ✅ | Native support. |
| **OpenRouter** | ✅ | Works perfectly. |
| **Google Gemini** | ✅ | Via their OpenAI-compatible endpoints. |
| **Vertex AI** | ✅ | Works with an OpenAI-compatible adapter. |
| **Nvidia NIM** | ✅ | Fully compatible. |
| **DeepSeek** | ✅ | Chat and reasoner models, cache-aware pricing. |
| **Groq / Cerebras** | ✅ | Fast inference supported. |

Any other `POST /v1/*` endpoint is routed too, as long as the JSON body carries a `model` field.

---

## 🎨 Visuals & Animations

The dashboard went from cyber-terminal to **calm and modern**:

*   **Light & Dark Modes**: System-aware with a one-click toggle, remembered per browser.
*   **Micro-Animations**: Hover lifts, fading modals, skeleton loaders, animated badges — all CSS, all respecting `prefers-reduced-motion`.
*   **No CDN, No Build**: The UI is plain HTML, CSS, and ES modules shipped with the server.

---

## 📦 Installation

SmolOrchestrator runs anywhere Node runs: a $5 VPS, a home server, a container, or your laptop.

1.  **Install and Configure**
    ```bash
    npm run setup
    ```
    The installer runs `npm install`, prompts for your admin email and password, generates the
    application secret, writes `.env`, creates `storage/gateway.db`, applies migrations, and drops
    the install lock.

2.  **Start**
    ```bash
    npm start
    ```
    Default listener: `http://127.0.0.1:8787`. Admin UI: `/admin`.

3.  **Expose It** (optional)
    Put any reverse proxy or tunnel in front — for example a Cloudflare quick tunnel:
    ```bash
    cloudflared tunnel --url http://127.0.0.1:8787
    ```
    The tunnel is external infrastructure; the gateway itself needs no Cloudflare configuration.

---

## ⚡ Usage

Once installed, SmolOrchestrator exposes an OpenAI-compatible API.

### Endpoint Configuration

Point any OpenAI-compatible client (OpenCode, LangChain, Chatbox, etc.) at your gateway.

*   **Base URL**: `https://your-host/v1`
*   **Chat Completions**: `/v1/chat/completions`
*   **Models**: `/v1/models` returns only the models your key is scoped to.

### Example Request

```bash
curl https://your-host/v1/chat/completions \
  -H "Authorization: Bearer YOUR_GATEWAY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ds-v4.1-flash",
    "messages": [
      {
        "role": "user",
        "content": "Hello via SmolOrchestrator!"
      }
    ],
    "stream": true
  }'
```

Responses carry helpful headers: `X-Smolorchestrator-Provider`, `X-Cache` (`hit`/`miss`/`coalesced`), `X-Request-Cost` when known, and `X-Budget-Remaining` / `X-Budget-Warning` for metered keys.

### Admin Dashboard

Login at `/admin` to:

*   Create **Models** (e.g., `ds-v4.1-flash`) and attach provider routes with upstream model IDs, per-million prices, capability flags, context limits, and optional daily caps.
*   Map **Providers** (OpenRouter, Gemini, NIM, …) with key pools.
*   Generate **Gateway Keys**, scope them to models, and set request/spend budgets.
*   Watch **Usage** — requests, tokens, cached-token savings, response-cache hit rate, and p50/p95 latency.
*   Read **Logs** — attempt-level telemetry with zero content capture.
*   Tune **Settings** — backoff, probes, health checks, cache, budgets, backups, and config transfer.

---

## 🔭 Operations

*   `GET /health` — liveness.
*   `GET /health/ready` — readiness (database reachable).
*   `GET /metrics` — Prometheus text metrics; set `METRICS_TOKEN` to require a bearer token.
*   Backups are plain SQLite snapshots (`BACKUP_*` settings) created on schedule or on demand.
*   Every configuration variable is documented in [`.env.example`](.env.example).

---

## 📚 API Documentation

The Postman collection at [`postman/smolorchestrator.postman_collection.json`](postman/smolorchestrator.postman_collection.json) documents every gateway and admin endpoint, including request/response shapes and the CSRF flow.

## 🧪 Testing

```bash
npm test
```

Covers migrations, authentication and model scoping, balancing strategies, cache-aware pinning, failover and cooldowns, probes and health checks, response cache and singleflight, usage extraction (streaming, non-streaming, estimation), cached-token savings, budgets and quotas, capability routing, byte transparency, client-disconnect propagation, backups, config import/export, admin API security, and the hot-path selection budget.

---

## 📜 License

This project is open-sourced software licensed under the **GNU Affero General Public License v3 (AGPL-3.0)**. See [LICENSE](LICENSE) for details.
