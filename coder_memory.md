# coder_memory.md — ad-hoc project decisions from working sessions.
# Append-only; changed decisions get a new entry with explicit supersession. Header states purpose.

[2026-10-03] [architecture] Gateway injects stream_options.include_usage=true on streamed chat requests when the client did not set it — locked for token telemetry.
[2026-10-03] [architecture] Route cost is tracked as separate input/output price per million tokens.
[2026-10-03] [architecture] Load-balancing strategy (round-robin vs least-used) is an admin-toggleable setting, not a hardcoded choice.
[2026-10-03] [architecture] Failed routes use backoff cooldown plus active probe recovery; the probe is a real minimal model request ("hello world"), not a health-endpoint check.
[2026-10-03] [architecture] API keys map to pools of provider keys; pools rotate independently of provider records.
[2026-10-03] [architecture] Gateway runtime target is Node.js + SQLite, single process; the existing PHP implementation is legacy. Supersedes the implicit PHP runtime choice.
[2026-10-03] [architecture] Gateway uses pure Node.js with no web framework (no Hono/Express/Fastify); HTTP handling is hand-rolled.
[2026-10-03] [architecture] Repo layout: PHP implementation moves under legacy/; the new Node application lives at the repo root.
[2026-10-03] [architecture] Quota caps are optional and per provider route (daily request cap); gateway tokens carry no quota.
[2026-10-03] [style] Admin UI: modern, minimal, light/dark toggle, micro animations with finesse and polish — supersedes the existing cyber-terminal aesthetic.
[2026-10-03] [architecture] First-run setup is setup.js: runs npm install, prompts admin email/password, creates storage dir + app secret, runs schema migrations, seeds admin user, writes .env, creates .install.lock. Existing lock → script exits with message.
[2026-10-03] [security-exception] Password hashing uses scrypt (Node built-in); argon2id would require a dependency against the zero-dependency constraint — user confirmed scrypt.
[2026-10-03] [architecture] Balance strategy 'cache_aware' (third option): each gateway token is pinned per model to one provider route + exact key; pins are sticky until failure, quota exhaustion, or cooldown, then reassign to a replacement that becomes the new main (no failback). Assignments across tokens balance by fewest pins.
[2026-10-03] [architecture] Gateway tokens support optional daily/monthly request and spend budgets, enforced in memory against telemetry usage — supersedes the earlier "tokens carry no quota" entry of 2026-10-03.
[2026-10-03] [architecture] Route costs may be null = auto-priced from the built-in best-effort model price map; any explicit per-route cost is a manual override and wins. Rules: per-token budgets (daily/monthly requests and spend), Prometheus /metrics endpoint, proactive background health checks. Pass-through of native non-OpenAI protocols is deferred until a real client needs it.
[2026-10-03] [architecture] Dashboard is the sole visibility channel for proxy features for now; message/notification pipelines (webhooks, Slack, email) are explicitly deferred. Soft budget alerts surface as dashboard warnings and response headers only.
[2026-10-03] [architecture] Planned/implemented feature batch: exact response cache + singleflight for temperature=0 JSON requests, cached-token telemetry + savings report, capability-aware routing + preflight validation, generic JSON /v1/* passthrough, backups + config export/import, dashboard budget alerts, client headers + latency percentiles.
