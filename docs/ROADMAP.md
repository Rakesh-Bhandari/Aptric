# Aptric: platform roadmap, monetisation architecture and competitive defence

Goal: grow Aptric from a daily-aptitude app into a **serious practice-and-assessment platform** (think LeetCode/HackerRank for aptitude *and* coding) with ads for free users, memberships that remove ads and unlock more capable AI, and a defensible position against bigger competitors.

Companion documents: `SECURITY-AUDIT.md` (what to fix first) and `SCALING.md` (how to carry the load).

---

## 1. Where Aptric stands today

**Already built (genuine assets):**

- Daily personal sets by level/league/topic preference, XP, streaks, levels, ratings, weekly leagues Bronze → Diamond, timed contests with integrity checks, placement test, practice by topic, mistake review, push notifications, PWA basics.
- **Game rules in Postgres** (RLS + `SECURITY DEFINER`), so answers never reach the browser early. This is hard to retrofit and is a real moat for any competitive/paid product.
- **Verified AI question pipeline**: generate → validate → dedupe (embeddings) → computed numeric check → independent solve → human review queue. Most competitors' AI content has no such gate.
- **AI Tutor** that teaches around a question, charges the hint penalty fairly, is locked during contests, and degrades to stored hints.
- Admin area (questions, review queue, contests, users, reports, jobs, audit log).

**Gaps to close before charging money or running ads:**

| Gap | Why it blocks you |
|-----|-------------------|
| Public, crawlable pages (SSR/prerender, sitemap, topic & sample-question pages) | No organic traffic, ad networks and Google Ads reviewers need real public content |
| Standalone Privacy Policy, consent, DPDP compliance | Required for ads, Google sign-in verification and payments |
| Copyright clean-up of content sources (`SECURITY-AUDIT.md` B11) | Legal exposure grows with revenue |
| Billing | Nothing to charge with yet |
| Security open items O1–O9 | You are about to hold payment-related and ad-related data |

---

## 2. Monetisation architecture (foundation already in this commit)

### 2.1 What exists now

| Piece | Where | What it does |
|-------|-------|--------------|
| `public.plans` | `supabase/migrations/20261011000001_plans_entitlements.sql` | One row per plan with `features` (switches, e.g. `ads`, `ai_tier`, `advanced_analytics`) and `limits` (numbers, e.g. `tutor_messages_per_day`). `free` is active and **mirrors today's behaviour exactly**; `plus` and `pro` are seeded **inactive** until billing ships. |
| `public.subscriptions` | same | Who holds which plan, status (`trialing/active/past_due/canceled/expired`), provider (`razorpay/stripe/apple/google_play/promo/manual`), period end. Players can read only their own; nobody but the API can write. |
| `private.billing_events` | same | Every payment-provider webhook stored once by `(provider, event_id)`: idempotent processing and an audit trail. |
| `private.entitlements_for(uid)` | same | Picks the best live plan (past-due keeps access as a grace period; canceled keeps access until the paid period ends), else `free`. Tested (11 pgTAP assertions in `supabase/tests/database/entitlements.test.sql`). |
| `backend/src/entitlements.js` | API | `getEntitlements(userId)` (60 s cache), `limitFor(...)`, `hasFeature(...)`, `requireFeature('name')` middleware → **HTTP 402 `upgrade_required`**, `invalidateEntitlements(userId)` for after a webhook. |
| `GET /me/entitlements` | API | `{ plan, name, features, limits, show_ads }` for the browser. |
| Tutor limits per plan | `backend/src/routes/tutor.js` | Hourly/daily AI-message budgets now come from the player's plan (falls back to the server default). |
| `useEntitlements()` | `frontend/src/lib/queries.ts` | `{ plan, showAds, can('feature'), limit('key') }`; defaults to *free* while loading so paid UI never flashes open. |

**Adding a paid feature later is a three-line change:** add the key to `plans.features` or `plans.limits`, guard the route with `requireFeature('x')` / `limitFor(...)`, and gate the UI with `can('x')`. No schema change.

### 2.2 What to build next (in order)

1. **Billing provider.** Razorpay for India (UPI, cards, netbanking, autopay mandates), Stripe for international. Flow: create checkout → provider redirects back → **webhook** is the source of truth.
   - `POST /billing/checkout { plan, interval }` (auth) → hosted checkout URL.
   - `POST /billing/webhook/:provider`: verify signature on the *raw* body, insert into `private.billing_events` (conflict ⇒ already handled), upsert `public.subscriptions`, call `invalidateEntitlements`, return 200 fast.
   - `POST /billing/portal` → provider's customer portal for cancel/update card. Never store card data.
   - Edge cases to design in: failed renewals (`past_due` grace, dunning emails), refunds/chargebacks (revoke), proration on upgrade, GST invoices (India), trial abuse (one trial per email/device), annual plans, promo/coupon codes, student discount verification.
   - Add the provider's script/frame hosts to the CSP in `frontend/vercel.json` only when you integrate (Stripe needs `js.stripe.com`; Razorpay needs `checkout.razorpay.com`).
2. **Paywall UX.** One reusable `<UpgradePrompt feature="…">`, a pricing page, and a 402 handler in `lib/http.ts` that opens it. Show value (what changes), not locks; never block the daily set for free users: the daily habit is your funnel.
3. **Model routing by plan (AI tiers).** Add `ai_tier` (`standard` | `advanced`) to the tutor config: free → fast/cheaper model (and cached replies, see `SCALING.md` §3), Plus → better model, Pro → best model + longer context, voice, and step-by-step video-style explanations. Keep the leak guard and "no answer while solving" rules for every tier. Add a global daily LLM-spend kill-switch.
4. **Free-tier limits that feel fair.** Candidates: tutor messages/day, number of contests per month, mistake-review depth, advanced analytics (topic heatmap, percentile vs cohort, time-per-question), downloadable reports, streak freezes. Change numbers in the `plans` table, no deploy needed.

### 2.3 Ads (for free users)

- **Rules:** ads only for `show_ads` users; **never** on solve screens, contests, placement or the tutor (hurts learning, hurts integrity, hurts retention); respect consent (Consent Mode v2 / a CMP) before loading any ad script; keep CLS near zero with reserved slots.
- **Where they fit:** landing/topic content pages (the SEO traffic), results screens, Today (below the fold), leaderboard, practice index.
- **Implementation:** an `<AdSlot name="…"/>` component that renders nothing unless `useEntitlements().showAds` and consent is granted; lazy-load the ad script on first slot; add the ad network domains to the CSP at that moment. AdSense needs an approved site with real public content and a Privacy Policy (see gaps above); Google Ad Manager for direct deals later.
- **Distinguish two "Google Ads":** *displaying* ads (AdSense/Ad Manager, above) vs *buying* ads to acquire users (Google Ads campaigns). The second needs crawlable landing pages, conversion tracking (consented), and UTM-aware signup attribution (store it in a new `acquisition` jsonb column on `profiles`).
- **Membership removes ads** automatically: `plans.features.ads = false`.

---

## 3. Phased roadmap

Effort is for one focused full-stack developer *(estimate)*; parallelise with a second person.

### Phase 0: Trust and safety (2–3 weeks) *do before marketing or billing*

| Deliverable | Done when |
|-------------|-----------|
| Security open items O1 (direct pooled Postgres), O2 (HttpOnly refresh cookie), O3–O6, O10 | `SECURITY-AUDIT.md` open table has no 🔴/🟠 left |
| Auth route tests + pgTAP suites run in CI (`supabase start` job) | CI red on any regression |
| Custom domain, Cloudflare Turnstile, SES/Resend email with SPF/DKIM/DMARC | Signup mails land in inbox; bots blocked |
| Sentry + uptime + PITR drill | You get paged before users complain |
| Legal: remove copyrighted PDFs & purge history, Privacy Policy, ToS, DPDP consent + data export/delete | Lawyer-reviewable pack exists |

### Phase 1: Be findable, then be paid (4–6 weeks)

| Deliverable | Done when |
|-------------|-----------|
| **Public SEO layer**: prerender/SSR the marketing site and per-topic pages (Vite SSG, or move the public part to Next.js/Astro while the app stays an SPA), `sitemap.xml`, `robots.txt`, absolute OG images, structured data (Quiz/FAQ), `hreflang` for Hindi | Google indexes topic pages; link previews work |
| 500+ public sample questions + formula sheets + "how to solve" pages (original content) | Organic landing pages per topic and exam |
| Razorpay/Stripe billing, webhooks, pricing page, paywall UX, coupon codes | A real card/UPI payment flips `plan` within seconds |
| Plus tier live: ad-free, higher tutor limits, advanced analytics, contest history | ≥ 1 paying cohort |
| Ads for free users on public pages and results screens (after AdSense approval) | RPM tracked per page type |
| Analytics (PostHog/Plausible) with consent; funnel: visit → signup → first set → day-7 return → paid | Dashboard exists |

### Phase 2: Scale and reliability (parallel with Phase 1, see `SCALING.md`)

Pre-built daily sets, cached pools, direct Postgres, queues for push/email/generation, Redis for rate limits and hot leaderboards, load tests in CI.

### Phase 3: Smarter learning (6–10 weeks)

- **Adaptive engine:** per-skill ability (IRT / Elo per subtopic) from attempt data; difficulty calibration from real solve rates instead of the author's label; "next best question" and **spaced repetition** for mistakes.
- **Mock tests:** full-length timed papers per exam (TCS NQT, Infosys, CAT, bank PO…), section cut-offs, percentile and rank vs everyone, post-test analysis report.
- **AI features (Pro):** personalised study plan, weak-area drills, "explain like I'm 15", multilingual explanations (Hindi first), photo-of-a-question solver gated behind plan, voice tutor, AI-generated variants of questions you got wrong.
- **Content quality loop:** auto-flag questions with unusual solve rates or many reports, re-verify with the numeric checker, retire or fix.

### Phase 4: Coding platform, a LeetCode/HackerRank-class product (3–5 months)

This is a product of its own; start only after Phases 0–1 are stable.

**Product slice 1 (MVP, ~6 weeks):** problem list + filters (difficulty, topic, company, frequency), Monaco editor, run against samples, submit against hidden tests, verdicts (AC/WA/TLE/MLE/RE/CE), submission history, 3 languages (Python, Java, C++), editorial and discussion later.

**Execution architecture (do not skip):**

```text
Browser ─▶ API (auth, entitlement, rate limit) ─▶ queue ─▶ judge workers (autoscaled, separate network)
                                                         └─ sandbox per run: Judge0/Piston, or Firecracker/gVisor/nsjail
                                                            no network, read-only FS, CPU/mem/time/pid/output limits
          ◀─ SSE/poll ◀─ results table ◀──────────────────┘
```

- **Never execute user code on the web/API tier or in Vercel functions.** Untrusted code runs in dedicated sandboxed workers on separate infrastructure with no access to your database credentials or internal network.
- Hidden test cases are **never** sent to the browser; reveal only the failing case's input for samples you choose.
- Per-plan limits through the same entitlements: runs/day, languages, longer time limits, private test cases, saved submissions history.

**Data model sketch** (new migration, all RLS-protected, writes via `SECURITY DEFINER`/API):

| Table | Key columns |
|-------|-------------|
| `problems` | id, slug, title, statement_md, difficulty, time_limit_ms, memory_limit_mb, status, source/licence, created_by |
| `problem_tags`, `problem_companies` | many-to-many tags/companies |
| `test_cases` | problem_id, input, expected_output, is_sample, weight, checker (exact/token/float/special) |
| `problem_languages` | problem_id, language, starter_code, per-language limit multipliers |
| `submissions` | id, user_id, problem_id, language, code, status, runtime_ms, memory_kb, tests_passed, created_at, contest_id? |
| `submission_results` | submission_id, test_case_id, verdict, time, memory (stdout truncated) |
| `contest_problems`, `contest_submissions` | reuse your `contests`; ICPC (penalty) or IOI (partial) scoring |
| `editorials`, `discussions` | later |

Reuse what you have: ratings/Elo, leagues, streaks, contests UI, admin review queue (problems get the same draft → review → published flow), tutor (hints without code leaks), push notifications.

**Differentiator to build in from day one:** *aptitude + coding in one placement journey* (see §4): one profile, one readiness score, one daily habit.

### Phase 5: Institutions and B2B (3+ months, highest revenue per customer)

- **Organisations, cohorts, seats:** colleges, coaching centres and employers create classes, invite students, assign sets/mocks/contests, see cohort analytics and weak topics.
- **Proctored assessments** (webcam snapshots, tab/fullscreen locks, plagiarism detection for code, randomised question pools) for hiring and campus drives; certificates with verifiable URLs.
- **Admin & integrations:** SSO (Google Workspace / Microsoft), CSV roster import, LMS/ATS webhooks, white-label domain.
- **Entitlement fit:** add `plans` rows of kind organisation (`seats`, `proctoring`, `custom_branding` limits) and an `organizations`/`org_members` table; the same `requireFeature` machinery applies.

### Phase 6: Reach

Native mobile (Capacitor wrapper first, React Native only if needed), offline practice packs, Hindi + other Indian languages, accessibility audit (you already run axe e2e), referral programme, public API for partners.

---

## 4. Defending Aptric against competitors

> I have not benchmarked live competitor products for this document. Treat the "who does what" below as categories and verify current features before you quote any specific company externally.

### The landscape, in three buckets

1. **Free aptitude content sites** (large static question banks, strong SEO). Weak: static content, no adaptivity, no community or assessment depth, ad-heavy UX.
2. **Test-prep platforms** (video courses, mock tests, subscriptions). Weak: broad but expensive, generic one-size-fits-all paths, content quality varies, heavy sales-led funnels.
3. **Coding platforms** (LeetCode/HackerRank/GFG class). Strong coding judge and community. Weak for *aptitude and verbal/reasoning*, which many placement exams test first.

### Your moats (and how to make each one deeper)

| Moat | Today | Deepen with |
|------|-------|-------------|
| **Verified-content engine**: AI generation gated by numeric checks, independent solve, dedupe and human review | Built | Publish solve-rate-based quality scores; show "verified" badges; reuse as a B2B content licence |
| **Integrity by design**: server-side rules, answer keys never in the browser, contest locks | Built | Server-timed answers, proctoring tier, anti-multi-account; makes certificates and contests *trustworthy* |
| **Personalised daily habit**: level/league/topic-aware sets, streaks, leagues | Built | Adaptive engine (Phase 3); habit is retention, retention is your cost advantage |
| **Data flywheel**: every attempt improves difficulty calibration, recommendations, and question quality | Collecting | Per-skill ability model, public percentile rankings, "readiness score" per exam |
| **Tutor that teaches, not tells** (pays the hint penalty, leak-guarded) | Built | Per-plan model tiers, multilingual, voice; learning-science framing (spaced repetition, retrieval practice) |
| **Aptitude + coding in one place** | Aptitude only | Phase 4; your unique bundle for placements |
| **Institution layer** | None | Phase 5: sticky, annual contracts |

### What to say when challenged

| Challenge | Answer |
|-----------|--------|
| "Big players have more questions." | Volume is commodity. Aptric guarantees *verified* questions with measured difficulty, personalised to the learner's level; quantity grows weekly through the pipeline, quality is the point. |
| "Anyone can wrap an LLM." | Aptric's AI is constrained: answers are computed and cross-checked before publishing, the tutor can't leak answers during scoring, and costs are controlled by caching and tiering. |
| "Why would students pay?" | Free habit forms the funnel; paid removes ads and unlocks stronger AI, deeper analytics and mocks. Price is a fraction of one coaching-class session (test ₹ pricing, see §5). |
| "Cheating will ruin the leaderboard." | Server-side rules and timing, integrity locks, anti-multi-account, and an optional proctored tier; trust is the product. |
| "You're India-only." | Exam taxonomy and content are pluggable (`tracks`, `tags`); the platform generalises to other markets after India. |

### Things competitors can copy quickly (so don't rely on them)

Daily streaks, leagues, a chat tutor. What they can't copy quickly: your **verified content graph, your attempt data, your integrity guarantees, and institutional relationships**. Invest there.

---

## 5. Business model and metrics *(hypotheses to test, not facts)*

**Plans (suggested starting points, validate with a pricing experiment):**

| Plan | Price hypothesis (India) | Includes |
|------|-------------------------|----------|
| Free | ₹0 | Daily set, practice, contests, leagues, limited tutor, ads on public/result pages |
| Plus | ≈ ₹99–149 / month, ≈ ₹799–999 / year | No ads, 3× tutor limit, advanced analytics, contest history, mistake deep-dives |
| Pro | ≈ ₹299 / month, ≈ ₹2,199 / year | Everything in Plus + best AI model, study plan, mock-test analytics, priority generation of weak-topic drills, coding platform premium |
| Campus / Institution | per-seat annual | Cohorts, assignments, proctoring, branded contests, reports |

**Metrics to instrument now:** D1/D7/D30 retention, daily-set completion rate, streak length distribution, signup → first answer conversion, free → paid conversion and time-to-convert, ARPU/ARPPU, churn and involuntary churn, tutor cost per active user, ad RPM, CAC by channel, NPS.

---

## 6. Decisions I need from you

1. **Copyrighted PDFs in the repo** (`SECURITY-AUDIT.md` B11): confirm you want them removed and history purged, and that imports stop using third-party books.
2. **Domain name** (unblocks cookies, email deliverability, clean CORS/CSP). Which one?
3. **Billing provider order**: Razorpay first (India) then Stripe, or both at launch?
4. **Free-tier limits**: keep today's generous limits at launch of Plus, or tighten (e.g. tutor 200 → 30/day) at the same moment?
5. **Public SEO layer**: prerender inside this Vite app, or a separate marketing site (Astro/Next)?
6. **Coding platform timing**: after Phase 1 revenue, or earlier as the headline differentiator?
