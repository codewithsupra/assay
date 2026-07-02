# Assay — verified proof-of-skill for deployed projects

Candidates submit a **deployed app**; Assay runs uptime probes, API contract checks, and (from M2) real load tests against it, then issues a **cryptographically signed, publicly shareable report** — proof that the system *runs*, not just that the repo exists.

> Working name: **Assay** (*to test the quality/purity of a material*). Renaming is a find-and-replace. Backups: Attestly, Proofline, Verity.

## The dogfood loop (the point)

Assay's first verified project is **Pulse**. Pulse's README carries an Assay badge; Assay's README shows Pulse's signed report. Two of my systems verify each other — a closed loop no screenshot can fake.

## The design pillar: consent

A load generator pointed at an arbitrary URL is a DDoS cannon. So **ownership verification is a hard gate, not a feature flag**: no probe job is ever created for a project until its owner proves control of the target by either

- serving a token at `https://<host>/.well-known/assay-verify.txt`, or
- publishing a TXT record at `assay-verify.<host>`.

`projects.verified_at` gates the scheduler; the runner double-checks it and refuses paused (emergency-stopped) projects on every claim. Per-plan rate caps and per-target cooldowns arrive with the runner fleet in M2.

## Architecture

- **Commodity layers → InsForge** (target for deploy): auth, Postgres with RLS for multi-tenancy, storage for raw run artifacts, realtime for live run progress, Stripe/Razorpay later. The schema's `user_id` columns are written to back RLS directly; app-level scoping stays as defense in depth.
- **The hard core → self-built**:
  - **Orchestrator + durable job queue in Postgres**, claimed atomically with `SELECT ... FOR UPDATE SKIP LOCKED`. This is the deliberate SQL twin of Pulse's atomic Mongo `findOneAndUpdate` claim — same distributed-scheduling problem, solved idiomatically in each stack.
  - **Probe engine**: uptime %, latency, and contract checks against a declared endpoint spec.
  - **Signed reports**: Ed25519 signature over a canonicalized payload; public verification endpoint + embeddable badge. Tamper-evidence is what makes the report worth more than a screenshot.

```
Browser ── REST ─▶ Express API ──▶ Postgres (users, projects, jobs, probes, reports)
                                      ▲
Worker(s) ── claim due jobs (SKIP LOCKED) ──▶ probe target ──▶ record ──▶ reschedule
                                      │
                          signed report ──▶ /r/:id  ·  /r/:id.json  ·  /r/:id/badge.svg
```

## Status — M1 shipped

**M1 (Verify & watch):** auth, project registration, ownership verification, uptime + contract probes, atomic scheduler, signed public report page + badge. **12/12 tests pass**, including a two-worker concurrency test proving no job is ever double-claimed and a tamper test proving edited reports fail verification.

- **M2 — The fire:** runner fleet (separate long-running Node service on Render/Fly), `autocannon`-driven load campaigns with ramp profiles, live progress over realtime, HDR histograms. Pulse gets its badge.
- **M3 — Campaigns & profiles:** multi-day verification campaigns, metric rollups, public verified-portfolio pages.
- **M4 — SaaS dress:** plans + payments, per-plan rate caps in the orchestrator, Assay load-testing itself in CI with published numbers.

## Run it locally

Requires a local Postgres (or use `docker compose up`).

```bash
cd server
createdb assay_dev && createdb assay_test   # first time
npm install
npm run migrate
npm run dev            # API + scheduler on :8001

# see a signed report end-to-end:
node scripts/seed-demo.js   # prints a public report URL, e.g. /r/<id>
```

```bash
npm test               # 12 integration tests against a real local Postgres
```

Docker (Postgres + server in one command):

```bash
docker compose up --build   # http://localhost:8001/health
```

## API (M1)

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

GET  /r/:publicId                 public HTML report page (no auth)
GET  /r/:publicId.json            raw signed payload + signature_valid
GET  /r/:publicId/badge.svg       embeddable README badge
```

## Stack

Node.js · Express · PostgreSQL (`pg`, SKIP LOCKED) · Ed25519 (node:crypto) · JWT · bcrypt · Jest/Supertest · Docker. Deploy target: InsForge (auth/Postgres/RLS/realtime) + a small paid runner box in M2 for credible load numbers.
