# Assay — verified proof-of-skill for deployed projects

Candidates submit a **deployed app**; Assay runs uptime probes, API contract checks, and real load tests against it, then issues a **cryptographically signed, publicly shareable report** — proof that the system *runs*, not just that the repo exists.

> Working name: **Assay** (*to test the quality/purity of a material*). Renaming is a find-and-replace. Backups: Attestly, Proofline, Verity.

## The dogfood loop (the point)

Assay's first verified project is **Pulse**. Pulse's README carries an Assay badge; Assay's README shows Pulse's signed report. Two of my systems verify each other — a closed loop no screenshot can fake.

## The design pillar: consent

A load generator pointed at an arbitrary URL is a DDoS cannon. So **ownership verification is a hard gate, not a feature flag**, and every load campaign is bounded server-side:

- No probe or load job is ever created until the owner proves control of the target — serving a token at `https://<host>/.well-known/assay-verify.txt`, or publishing a TXT record at `assay-verify.<host>`. `projects.verified_at` gates the scheduler; every job claim re-checks it and refuses paused (emergency-stopped) projects.
- Load campaigns are **hard-capped server-side** regardless of what the client requests (`MAX_CAMPAIGN_CONNECTIONS`, `MAX_CAMPAIGN_DURATION_S`) — verified live: a request for 9999 connections / 9999s came back clamped to 50 / 30s.
- A **per-target cooldown** blocks back-to-back campaigns against the same project — verified live: a second campaign request was rejected with `429 per-target cooldown active`.
- **Abort-on-error-budget**: the runner watches autocannon's tick stream and calls `.stop()` if the sustained error rate exceeds `CAMPAIGN_ERROR_BUDGET_PCT` — measuring a struggling service, not piling onto it.

## Architecture

- **Commodity layers → InsForge** (deploy target): auth, Postgres with RLS for multi-tenancy, storage for raw run artifacts, Stripe/Razorpay later. The schema's `user_id` columns are written to back RLS directly; app-level scoping stays as defense in depth.
- **The hard core → self-built**:
  - **Orchestrator + durable job queue in Postgres**, claimed atomically with `SELECT ... FOR UPDATE SKIP LOCKED`. The deliberate SQL twin of Pulse's atomic Mongo `findOneAndUpdate` claim — same distributed-scheduling problem, solved idiomatically in each stack. The API process and the runner process share this one table, each claiming only the job `type` it knows how to run.
  - **Probe engine**: uptime %, latency, and contract checks against a declared endpoint spec.
  - **Runner fleet**: a separate long-running Node process (`src/runner.js`, deployed on Render/Fly — not an edge function, since sustained load generation needs a real process). `autocannon` is the traffic engine (battle-tested; hand-rolling a load generator invites subtle lies like coordinated omission); Assay wraps it with warmup, tick-level progress, and the error-budget abort above.
  - **Cross-process live progress over Postgres `LISTEN`/`NOTIFY`**: the runner is a different OS process from the API, so it can't call the API's in-memory Socket.io emitter directly. The runner publishes tick events via `NOTIFY`; the API process holds a dedicated `LISTEN` connection and relays them to subscribed browsers over a JWT-authenticated, per-project Socket.io room.
  - **Signed reports**: Ed25519 signature over a canonicalized payload — normalized through JSON so what's signed matches exactly what's stored (a real bug: `Date` columns survive a JSONB round-trip as strings, so signing the pre-round-trip object produced a signature that failed to verify against the stored copy). Public verification endpoint + embeddable badge report real, honestly-labeled percentiles — autocannon doesn't bucket at exactly p95, so the report shows p50/p90/p97.5/p99 rather than mislabeling one of them.

```
Browser ── REST + Socket.io ─▶ API process ──▶ Postgres (users, projects, jobs, probes, campaigns, reports)
                                    ▲                              ▲
                              LISTEN assay_events            SKIP LOCKED claim (type='load_campaign')
                                    │                              │
                                    └──────── NOTIFY ◀──── Runner process ──▶ autocannon ──▶ target
                                                                                (separate OS process)
```

## Status — M1 + M2 shipped

**M1 (Verify & watch):** auth, project registration, ownership verification, uptime + contract probes, atomic scheduler, signed public report page + badge.

**M2 (The fire):** standalone runner process, consent-capped `autocannon` load campaigns, abort-on-error-budget, cross-process live progress via Postgres LISTEN/NOTIFY + Socket.io, load metrics folded into the signed report and badge.

**18/18 tests pass** against a real local Postgres — including a two-worker SKIP LOCKED concurrency test, a report tamper test, a JSONB-round-trip signature regression test, and an end-to-end test that runs a real `autocannon` campaign through the scheduler. Verified live end-to-end outside the test suite too: registered a project, proved ownership by actually serving the verify token, ran a real load campaign through a separate runner process, and rendered the signed public report in a browser — **120,838 req/s sustained, 604,205 requests, 0 errors, signature valid.**

- **M3 — Campaigns & profiles:** multi-day verification campaigns, metric rollups, public verified-portfolio pages.
- **M4 — SaaS dress:** plans + payments, per-plan rate caps in the orchestrator, Assay load-testing itself in CI with published numbers.

## Run it locally

Requires a local Postgres (or use `docker compose up`).

```bash
cd server
createdb assay_dev && createdb assay_test   # first time
npm install
npm run migrate
npm run dev            # API + Socket.io + probe scheduler on :8001
npm run dev:runner      # in a second terminal: the load-campaign runner

# see a signed report end-to-end:
node scripts/seed-demo.js   # prints a public report URL, e.g. /r/<id>
```

```bash
npm test               # 18 integration tests against a real local Postgres
```

Docker (Postgres + server in one command; runs the API process only — add a second service block pointed at `node src/runner.js` for the runner fleet):

```bash
docker compose up --build   # http://localhost:8001/health
```

## API

```
POST /api/v1/auth/register        {email,name,password} → {user, token}
POST /api/v1/auth/login           {email,password} → {user, token}
GET  /api/v1/auth/me

GET  /api/v1/projects
POST /api/v1/projects             {name, target_url, endpoint_spec?, probe_interval_s?}
GET  /api/v1/projects/:id
POST /api/v1/projects/:id/verify  run ownership check → starts probing on success
POST /api/v1/projects/:id/pause   {paused} emergency stop / resume
GET  /api/v1/projects/:id/probes  recent probe results
POST /api/v1/projects/:id/reports {window_hours?} → signed report + public_url

POST /api/v1/projects/:id/campaigns             {connections?, durationS?, pipelining?} → queues a capped load campaign
GET  /api/v1/projects/:id/campaigns             recent campaigns
GET  /api/v1/projects/:id/campaigns/:campaignId campaign status + result

GET  /r/:publicId                 public HTML report page (no auth)
GET  /r/:publicId.json            raw signed payload + signature_valid
GET  /r/:publicId/badge.svg       embeddable README badge

Socket.io (auth: {token}): client emits "subscribe" with a project id (ownership-checked
server-side); server emits campaign:started / campaign:progress / campaign:done / campaign:aborted / campaign:failed to room project:<id>.
```

## Stack

Node.js · Express · PostgreSQL (`pg`, `SELECT ... FOR UPDATE SKIP LOCKED`, `LISTEN`/`NOTIFY`) · `autocannon` · Socket.io · Ed25519 (`node:crypto`) · JWT · bcrypt · Jest/Supertest · Docker. Deploy target: InsForge (auth/Postgres/RLS) + a small paid runner box for credible load numbers at scale.
