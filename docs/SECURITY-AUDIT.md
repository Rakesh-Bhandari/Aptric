# Aptric: security, bugs and glitches audit

**Date:** 2026-10-05 · **Scope:** the code in this repository (`backend/`, `frontend/`, `supabase/`, `.github/`).
**Method:** line-by-line read of every auth, API, tutor, push, admin and database-gateway file, a read of the Postgres migrations (grants, RLS, `SECURITY DEFINER`), `npm audit`, and a run of every existing test, linter and type-check. Fixes were checked in a real Postgres 16 and in Chromium against the production build.
**Not covered:** the live deployment. I could not see your Vercel, Supabase, Google Cloud or DNS settings, so Part 3 is a checklist for you to run through, not something I verified.

Legend: ✅ fixed in this change · 🔴 high · 🟠 medium · 🟡 low.

---

## Part 1: Security findings

### Fixed in this change

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| S1 | 🔴 | **Pre-registration account takeover.** An attacker signs up with a victim's email and the attacker's password (`POST /auth/signup`, account stays unconfirmed). When the real owner later proves the address with a **magic link or a password-reset link**, the account becomes verified, *and the attacker's password still works*. (Google sign-in already cleared the password; the other two paths did not.) | `consumeLinkToken` now drops the stored password when a magic or recovery link verifies a never-confirmed address (`backend/src/auth/accounts.js`). SQL verified in Postgres: attacker password removed, a verified owner's password untouched. **Residual:** an owner who clicks a *signup* confirmation they never requested still inherits the attacker's password. Real fix is in Part 2 (O1). |
| S2 | 🟠 | `POST /auth/password` checked the *current password* with no rate limit, so anyone holding a stolen 15-minute access token could guess the password offline-fast. | 10 attempts/hour per account and 30/hour per IP (`routes/auth.js`). |
| S3 | 🟠 | **No security headers anywhere.** The site had no CSP, HSTS, `X-Frame-Options` or `nosniff` (clickjacking, MIME sniffing, no XSS damage limit). | Frontend: CSP (inline theme script allowed by hash only, no `unsafe-eval`), HSTS, frame denial, `nosniff`, referrer and permissions policies, immutable caching for hashed assets (`frontend/vercel.json`). API: strict headers on every response (`securityHeaders` in `backend/src/app.js`). Verified: production build renders with **zero CSP violations**; `src/test/headers.test.ts` fails the build if someone edits the inline script without updating its hash. |
| S4 | 🟠 | 15 known vulnerabilities in frontend dependencies (2 high in the production graph, via `vite`/`rollup`). | `npm audit fix` (lockfile only), 0 vulnerabilities now. Backend: already 0. |
| S5 | 🟡 | `POST /auth/logout` had no rate limit. | 120 per 5 minutes per IP. |
| S6 | 🟠 | **No CI at all.** Nothing ran tests, lint, type-check or `npm audit` on a push or PR, so a broken or vulnerable change could ship silently. | `.github/workflows/ci.yml` (backend tests, frontend typecheck/lint/test/build, production `npm audit`) and `.github/dependabot.yml`. |

### Open: do these next (ordered by risk)

| # | Sev | Finding | Why it matters | Fix |
|---|-----|---------|----------------|-----|
| O1 | 🔴 | **The database gateway runs raw SQL strings with the all-powerful secret key.** `backend/src/db.js` builds SQL by hand-inlining quoted literals (`literal()`), then `public.backend_sql` `EXECUTE`s it as the function owner, so **RLS and grants do not apply** (the code comments say so). The escaping is correct today and most queries are parameterised, but this is one escaping bug from full-database SQL injection, and anyone who ever sees `SUPABASE_SECRET_KEY` owns every row. It is also the main scaling bottleneck (see `SCALING.md`). | Highest-impact change in this document. | Connect with a real Postgres driver (`pg`/`postgres.js`) through Supavisor (transaction mode) using **bind parameters**, and run each request as `set local role authenticated` + `request.jwt.claims` (your own migration header `20261002000001_backend_auth.sql` describes exactly this design). Then RLS and column grants protect you again, and you can delete `backend_sql`. |
| O2 | 🔴 | **Sessions live in `localStorage`** (`frontend/src/lib/http.ts`), including the 30-day refresh token. Any XSS (a bad dependency, a future bug) lets an attacker steal a month-long session. The new CSP and DOMPurify reduce the chance, but do not remove the impact. | Account takeover at scale, admin takeover. | Put the refresh token in an `HttpOnly; Secure; SameSite=Lax` cookie; keep only the 15-minute access token in memory. Needs the API and the site on the same registrable domain (`app.aptric.app` + `api.aptric.app`): buy the domain first (also needed for email, O7). |
| O3 | 🟠 | **Refresh-token reuse is not detected.** Tokens rotate, but if a stolen token is used, nothing notices or kills the session family. | Silent long-lived session theft. | Store a `family_id` + the previous hash; if an already-rotated token is presented, delete the whole family and email the user. |
| O4 | 🟠 | **Access tokens are not tied to the session.** `requireUser` only verifies the signature, so logout, password change and bans do not stop an existing token for up to 15 minutes (`/tutor`, `/push`, `/me/*` keep working; game RPCs re-check bans in SQL, so scoring is safe). | Revocation is not real. | Drop the TTL to 5 minutes and/or check `private.sessions` (cached ~30 s) in `requireUser`. |
| O5 | 🟠 | **Account-lockout DoS on login.** `auth:login-email` counts *every* attempt (10 per 5 min), so anybody can lock any user out of password sign-in by hammering their email. | Harassment of top players / admins. | Count failures only, and key by (IP, email) in addition to email. |
| O6 | 🟠 | **No bot protection.** No CAPTCHA on sign-up, magic link, recover. `magic-link` creates an account for any email on first use. Leagues, contests and the free AI tutor are all worth farming with throwaway accounts. | Fake accounts, tutor-cost abuse, inbox bombing, spam-complaint damage to your sender reputation. | Cloudflare Turnstile (free) on sign-up / magic-link / recover; disposable-email blocklist; a **global daily AI budget kill-switch**. |
| O7 | 🟠 | **Email is Gmail SMTP with an app password.** Gmail caps sending (≈500/day personal, ≈2,000 Workspace), so a few hundred signups in a day will silently stop confirmation emails; no custom-domain SPF/DKIM/DMARC means spam-folder delivery. | Growth is capped by an email limit; links land in spam. | A transactional provider (Amazon SES, Resend, Postmark) on your own domain with SPF, DKIM and DMARC. |
| O8 | 🟠 | **Tutor can leak the answer.** While the learner is still solving, the correct option and explanation are placed *in the model prompt* (`tutor/prompt.js`, `<answer_key>`). Protection is the prompt's "never say it" rule plus a regex leak guard (`tutor/guard.js`); both are bypassable by a determined prompt injection (spell it in words, "rhyme the answer", base64, another language). | Undermines the daily-set/league integrity (a hint costs XP; a leak is free). Contests/placement are already locked (good). | During `solving`, give the model only the stored hint and the *question*, never the key; verify its reasoning with your existing numeric checker instead. Keep the guard as a second layer. |
| O9 | 🟠 | **Client-trusted timing and anti-cheat.** `time_ms` is supplied by the browser (only range-checked in SQL) and tab-switch detection is client-side, so a scripted client can fake speed and skip violations. | Matters the moment there are prizes, leaderboards with value, or certificates. | Record `served_at` server-side and compute time from it; flag impossible speeds; add IP/device-based multi-account detection; for high-stakes tests add real proctoring (webcam + browser lockdown) as a paid tier. |
| O10 | 🟠 | **CORS wildcard.** `https://aptric-*.vercel.app` (README example) matches *anyone's* Vercel project that starts with `aptric-`. Tokens are sent in headers, not cookies, so it is not directly exploitable today, but it would be once cookies (O2) are used. | Becomes critical after O2. | Scope previews to your team: `aptric-*-<your-team>.vercel.app`, or drop previews from production CORS. |
| O11 | 🟡 | `private.rate_limits` rows for IP subjects are only cleaned when *the same subject returns* (`gen_rate_limit` housekeeping), so one-off IPs accumulate forever. | Slow table growth on a table that is hit on every request. | `pg_cron` job: `delete from private.rate_limits where window_start < now() - interval '2 days'`. |
| O12 | 🟡 | `GET /health` is public and reveals which migrations are missing and whether the tutor is configured. | Minor information disclosure. | Return only `{status}` publicly; keep the detail behind the cron secret. |
| O13 | 🟡 | Admins have the same 15-minute bearer token as everyone; no 2FA. One phished admin = all question content, user bans, contests. | High blast radius, small team. | TOTP/passkey for the `admin` role; audit-log alerts on role changes. |
| O14 | 🟡 | Free-form text fields (`/feedback`, `/reports`) are capped in SQL but not in the API, and are shown to admins. They render through React (safe), but long inputs still cost a round trip. | Hygiene. | Add `zod` schemas (you already use it in the tutor) to the remaining routes. |

### What is already good (keep it)

- Passwords: bcrypt, constant-time "unknown email" path, generic answers on sign-up/recover/resend (no account enumeration).
- Sessions: only SHA-256 of refresh/link tokens stored, single-use links, rotating refresh tokens, redirect `next` is same-origin only, Google flow uses a signed `state` + cookie nonce.
- Database: **every table has RLS** (45 of 45), every `SECURITY DEFINER` function sets `search_path`, a test enforces that RPCs are whitelisted and check the caller, answers never leave the database before the one scoring attempt.
- `/rpc` is a strict whitelist with typed arguments; cron secret compared in constant time; push endpoints restricted to browser push services (no SSRF); Markdown is sanitised with DOMPurify and KaTeX `trust: false`.

---

## Part 2: Backend and frontend bugs, glitches and risks found

| # | Area | Finding | Impact | Status |
|---|------|---------|--------|--------|
| B1 | Backend | Pre-registration takeover (S1). | Security | ✅ |
| B2 | Backend | **Midnight stampede.** `ensurePersonalSet` runs on first daily call and loads the *entire* published-question pool into Node (`POOL_SQL`, no limit) plus 3 more queries. Your users are mostly in one timezone, so thousands hit this at the same minute. | Timeouts / 5xx at exactly the busiest moment, memory growth with a bigger bank | Open (see `SCALING.md` §3) |
| B3 | Backend | **Push cron cannot scale.** `/cron/push` loops all due users inside one serverless request (300 s max, 25 concurrent sends). | Notifications silently stop being delivered past a few thousand subscribers | Open (`SCALING.md` §4) |
| B4 | Backend | Every query is a PostgREST HTTPS round trip returning JSON (`backend_sql`); the rate-limit check alone is a full extra round trip on every auth call. | Latency and Supabase request cost grow linearly with traffic | Open (O1) |
| B5 | Backend | Login rate limit lets attackers lock out users (O5). | Availability | Open |
| B6 | Backend | Rate-limit table growth (O11). | Slow degradation | Open |
| B7 | Backend | `tutor` free-model chain (`:free` OpenRouter models) has no SLA and rate limits shared across *all* your users. | Tutor outages under load; the app already degrades to stored hints, which is the right fallback | Open (`ROADMAP.md`, model router) |
| B8 | Frontend | **The public site is a client-rendered SPA with one static `<title>`/description.** Crawlers (and Google Ads/AdSense reviewers) see an empty page; there is **no `robots.txt` or `sitemap.xml`**; `og:image` is a *relative* path, so WhatsApp/LinkedIn/Twitter previews are broken. | Poor SEO, social sharing and ad-approval risk. This is your cheapest growth channel for an exam-prep product. | Open (`ROADMAP.md` Phase 1) |
| B9 | Frontend | **Everything is behind sign-in**, so there are no indexable practice pages (topic pages, sample questions, formulas). | No organic traffic; ads need pageviews | Open (`ROADMAP.md`) |
| B10 | Frontend/Legal | Privacy and Terms are one page (`Terms.tsx`); there is no standalone Privacy Policy URL. Google OAuth verification, Google Ads/AdSense and the India **DPDP Act** all expect one, plus a consent mechanism before ads/analytics. | Blocks ads and Google sign-in verification | Open |
| B11 | Repo | **Two copyrighted books are committed** (`dokumen.pub_quantitative-aptitude…R.S. Aggarwal…pdf`, `500-Reasoning-Problems-GOSSC.in_.pdf`) and `prompts/question-import/` is a workflow to turn such PDFs into **auto-published** questions (`published` with no human review). For a commercial, ad-supported product this is a real copyright (takedown/DMCA/lawsuit) risk, and it also undermines the "verified" quality claim. | Legal / reputational. Also a due-diligence red flag for any investor or acquirer. | **Open, your decision**: remove the PDFs (and purge git history), stop importing from copyrighted books, keep original/AI-generated + licensed content only |
| B12 | Repo | No `LICENSE` file. | Ambiguity for contributors/investors | Open |
| B13 | Tests | 87 backend + 250 frontend tests pass, but **the auth routes (signup/login/refresh/Google) have no tests** and the 10 `supabase/tests/database/*.sql` pgTAP suites are not run in CI. | The most security-sensitive code is the least protected | Partly: SQL for S1 was verified manually; add tests (`ROADMAP.md` Phase 0) |
| B14 | Ops | No error monitoring, uptime check, or documented backup/PITR policy. | You find out about outages from users | Open |

Everything else I exercised ran clean: `tsc -b`, ESLint (0 issues), all unit tests, production build.

---

## Part 3: Hardening checklist for *you* (dashboard steps I can't do from here)

**Supabase**
1. Authentication → sign-ups **off** (already the intent in `config.toml`; confirm in the hosted project).
2. Turn on **Point-in-Time Recovery** / daily backups and *test a restore* once.
3. Keep the **secret key only in Vercel server env**; rotate it now if it was ever pasted anywhere (chat, screenshots, an issue). Add a second, read-only role for analytics.
4. Enable **Network restrictions**/SSL enforcement; use the **pooler** connection string once O1 is done.
5. Run the Security Advisor and Performance Advisor (dashboard → Advisors) and clear everything red.

**Vercel**
6. Backend env: `NODE_ENV=production`, `JWT_SECRET` ≥ 48 random chars (never the same in preview), `CRON_SECRET` set.
7. Protect preview deployments (Deployment Protection) so staging builds and their env are not public.
8. Add a custom domain for both site and API on the same parent domain; enable the Vercel Firewall / WAF rate rules on `/auth/*` and `/tutor/*`.
9. In `frontend/vercel.json`, once the API domain is final, change `connect-src 'self' https:` to `connect-src 'self' https://api.yourdomain`.

**GitHub**
10. Branch protection on `main`: require the new **CI** checks, PR review, no force-push.
11. Turn on **secret scanning + push protection**, **Dependabot alerts**, and **code scanning (CodeQL)**.
12. Two-factor authentication for every collaborator; least-privilege tokens.

**Google Cloud / email**
13. OAuth consent screen: add a Privacy Policy and Terms URL and request verification before you go public.
14. Move email to SES/Resend/Postmark with SPF + DKIM + DMARC (O7).

**Operations**
15. Add Sentry (frontend + backend), an uptime monitor on `/health`, and alerts on 5xx rate and p95 latency.
16. Write a one-page incident runbook: how to rotate secrets, ban a user, disable the tutor, restore the DB.
17. Pen-test or at least run OWASP ZAP against staging before taking payments.

---

## Part 4: What changed in this commit

`backend/src/app.js`, `auth/accounts.js`, `routes/auth.js` · `frontend/vercel.json`, `package-lock.json`, `src/test/headers.test.ts` · `.github/workflows/ci.yml`, `.github/dependabot.yml` · plans/entitlements foundation (see `ROADMAP.md` §2).

Verification run: backend 94/94 tests, frontend 250/250 tests, `tsc -b` and ESLint clean, production build + Chromium load with the new CSP (0 violations), `npm audit` 0 vulnerabilities in both packages, and the new SQL exercised in a real Postgres 16 (entitlement rules, RLS, and the S1 fix).
