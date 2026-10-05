# Aptric: scaling plan

How the current system behaves under load, what breaks first, and the order to fix it. Numbers marked *(estimate)* are back-of-envelope: replace them with measurements from the load test in §8 before you spend money on them.

## 1. How it works today

```text
Browser (React SPA, Vercel CDN)
   └─ HTTPS + Bearer ─▶ Express on Vercel serverless (one function, 300 s max)
                          └─ supabase-js ─▶ PostgREST (Data API) ─▶ public.backend_sql(jsonb) ─▶ Postgres
                          └─ OpenRouter / free LLMs (tutor, question generation)
GitHub Actions (hourly) ─▶ GET /cron/push ─▶ Web Push
pg_cron: daily sets, streaks, leagues, ratings
```

Strengths: stateless API (scales horizontally for free), every game rule in SQL, deterministic personal daily sets, no answer keys in the browser.

## 2. What breaks first (ranked)

| # | Bottleneck | Why | Symptom |
|---|-----------|-----|---------|
| 1 | **Database gateway.** Every query is an HTTPS call to PostgREST that wraps and returns JSON (`backend/src/db.js`). A typical answer submit is 2+ round trips (personal-set check, RPC); an auth call adds a rate-limit round trip first. | Latency per call is tens of ms *each*, PostgREST has its own concurrency limits, and you pay Supabase request/egress costs per call. | p95 climbs linearly with traffic; 5xx under bursts |
| 2 | **Midnight stampede.** Your players share a timezone, so "new daily set" happens for most of them within minutes. `ensurePersonalSet` then runs 4 queries *and loads the whole published-question pool into Node* for each player. | Thundering herd on the same tables at the same minute; memory grows with the question bank. | Timeouts at 00:00 local, worse every month the bank grows |
| 3 | **Per-request writes for rate limiting.** `gen_rate_limit` does an `INSERT … ON CONFLICT` plus a `DELETE` on *every* limited request. | Hot rows, WAL volume and table bloat on the busiest path; also never cleaned for one-off IPs. | Autovacuum pressure, slow auth endpoints |
| 4 | **Push cron in one request.** Everyone due is sent from a single 300 s function, 25 at a time. | ~25 sends per ~0.3 s ⇒ low thousands of users per run at best. | Notifications late or missing |
| 5 | **Leaderboards / leagues computed on read** from large tables. | Cost grows with players × attempts. | Slow league and leaderboard screens |
| 6 | **AI tutor budget.** Free `:free` models are shared and rate-limited across all users. | A traffic spike exhausts the shared quota; the fallback is stored hints (good). | "Tutor is busy" |
| 7 | **`attempts` table growth.** One row per answer, forever, and many queries filter by user + date. | *(estimate)* 100k DAU × 20 answers ≈ 2M rows/day ≈ 700M/year. | Index bloat, slow progress/mistakes queries |

## 3. Fix order

### Stage 0: quick wins (a day or two each, no architecture change)

1. **Cache the question pool** used by `ensurePersonalSet` (per track, in memory for ~10 min, or a `daily_pool` table refreshed hourly) instead of loading every published question per player.
2. **Pre-build daily sets.** A `pg_cron` job per timezone cohort (e.g. 23:00 local) inserts the next day's personal set for active players. The request path becomes "read one row"; the current lazy build stays as a fallback. This removes the midnight stampede.
3. **Move IP rate limiting out of Postgres** to the Vercel Firewall / Cloudflare (it's their job and costs no DB writes); keep only per-user and per-email counters in the DB. Add the `pg_cron` cleanup for what remains.
4. **Cache what is immutable:** `/catalog/*` and question content responses can carry `Cache-Control: private, max-age=300`; hashed frontend assets are now `immutable` (done in `vercel.json`).
5. **Cache tutor answers.** Hints, "steps", "concept" and "explain" for a given question barely change between users: store the generated reply per `(question_id, intent, model_tier)` and serve it from Postgres; only free-form chat reaches the model. This is likely your biggest LLM-cost saving.
6. **Self-host the font** (Plus Jakarta Sans) instead of Google Fonts: faster first paint, one fewer third party in the CSP, no GDPR/DPDP cookie-style concern.
7. **Index review.** Enable `pg_stat_statements`, look at the top 10 by total time, add the missing indexes. Check `attempts (user_id, created_at)` and `daily_set_items`.

### Stage 1: a real database connection (the highest-leverage change)

Replace `backend_sql` with a direct connection through **Supavisor (transaction pooler)**:

- real bind parameters (also fixes the SQL-injection-by-escaping risk, `SECURITY-AUDIT.md` O1),
- one round trip per statement (or a batch in one transaction), no JSON re-wrapping,
- per-request `set local role authenticated` + `request.jwt.claims`, so RLS protects you again,
- predictable connection counts: serverless functions hold a pooled connection only for the transaction.

*(estimate)* Cuts API latency by roughly half and removes PostgREST as a ceiling. Do this before any large marketing push.

### Stage 2: work that must not run on request threads

- **Push notifications:** enqueue per chunk (Upstash QStash, SQS, or Vercel Queues) and claim rows with `FOR UPDATE SKIP LOCKED`; each worker sends ~200 at a time and retries failures. Keep the idempotent `push_log` you already have.
- **Question generation:** already batch-per-request with leases (good). Move to a queue/worker when volumes grow so admin requests don't hold open serverless time.
- **Email:** send through the provider's API from a queue, with retries and bounce handling.
- **Leaderboards:** maintain them incrementally (a `leaderboard_entries` table updated on write or by a short-interval job) or as a materialized view refreshed every 1–5 min, with Redis sorted sets if you need real-time ranks in contests.

### Stage 3: growth tier

- **Redis (Upstash/Elastic/Valkey)** for sessions-of-record checks (revocation, `SECURITY-AUDIT.md` O4), rate limits, hot leaderboards and short caches.
- **Read replica** for analytics, admin lists and public profile/leaderboard reads.
- **Partition `attempts` by month**; archive cold partitions to cheap storage; keep per-user aggregates hot.
- **Public pages on the CDN / SSR** (see `ROADMAP.md` Phase 1): topic and sample-question pages are static-cacheable and carry your organic traffic.
- **Contest day mode:** pre-warm, read-only standings from cache, submissions written through a queue.

### Stage 4: the coding platform (separate scaling domain)

Running users' code is a different workload (CPU-heavy, adversarial). Never run it on the web tier: dedicated sandboxed workers (Firecracker/gVisor/nsjail via Judge0 or Piston), queue-fed, autoscaled, with hard CPU/memory/time/network limits. See `ROADMAP.md` Phase 4.

## 4. Frontend performance

- The JS is already route-split (`React.lazy`). The first-load chunks are `index` ≈ 400 kB and `markdown` (KaTeX + marked + DOMPurify) ≈ 330 kB: load the markdown chunk only on screens that render questions, and subset the KaTeX fonts.
- Add `<link rel="preload">` for the LCP image/font on the landing page; compress `LOGO.png`/`og.png` (consider AVIF/WebP).
- App-shell caching in the service worker (`public/sw.js` currently caches nothing) gives instant repeat opens and lets Practice survive flaky mobile networks.
- Track Core Web Vitals (Vercel Speed Insights or `web-vitals` → your analytics). Target LCP < 2.5 s on a mid-range Android on 4G; most of your users are on exactly that.

## 5. Capacity back-of-envelope *(estimate)*

| Metric | 10k DAU | 100k DAU |
|--------|---------|----------|
| Answers/day (20 each) | 200k | 2M |
| Average / peak submits per second (peak ≈ 15×) | 2 / 35 | 23 / 350 |
| DB round trips/s at peak today (≈ 3 per submit) | ≈ 100 | ≈ 1,000 |
| Same with Stage 1 + 0 (≈ 1 per submit) | ≈ 35 | ≈ 350 |
| Postgres needed after Stage 1 | small–medium instance | 4–8 vCPU + replica |

The point: today's gateway multiplies DB calls by about 3; Stages 0–1 bring a 100k-DAU peak within reach of a single mid-size Postgres.

## 6. Cost levers

- LLM: cache tutor replies (Stage 0 #5), route by plan (`ROADMAP.md` §2.3), budget kill-switch, small-model-first with escalation.
- Egress/requests: Stage 1 removes per-call PostgREST overhead; CDN-cache public pages.
- Email: SES-class pricing is a few dollars per 100k mails.
- Observability: sample traces; keep error events, drop noise.

## 7. Reliability

- **Backups:** Point-in-Time Recovery on, restore drill every quarter.
- **Migrations:** run in CI against a throwaway database (`supabase db reset` + `supabase test db`), forward-only, additive-then-cleanup for risky changes.
- **Graceful degradation (partly there):** tutor → stored hints; push off → app works; email down → resend path. Add: read-only mode flag, and a status page.
- **SLOs:** `submit_answer` p95 < 300 ms and 99.9% success; daily set available 99.95% in the 5 minutes after local midnight; page on burn rate, not on single errors.

## 8. Load test before you trust any estimate

Write `k6` scenarios for the five hot paths and run them against a staging copy of the database with realistic row counts (1M attempts, 50k questions, 100k users):

1. login + refresh (bcrypt is CPU-heavy; `BCRYPT_ROUNDS=10` is fine, don't lower it),
2. `get_today_set` at "midnight" (all users within 5 minutes),
3. `submit_answer` sustained at 350 req/s,
4. a 5,000-player contest (join, answer, standings polling every 15 s),
5. tutor chat with a stubbed LLM (to test streaming connections, not the model).

Track p50/p95/p99, error rate, DB CPU, connection count, and function duration. Fix the top item, re-run, repeat.
