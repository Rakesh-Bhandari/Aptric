# Session: Aptric Community (follow, 48h posts, 1v1 challenges, private leagues, user-hosted contests)

You are working on **Aptric** (React 19 + TypeScript frontend in `frontend/`, Express API in `backend/`, Supabase Postgres in `supabase/`). Add a social layer so learners keep each other accountable: **follow people, post short community messages that disappear after 48 hours, send a 1v1 "Beat my score" challenge on a set, run private leagues for a college or batch, and host contests**.

The aim is retention through friendly competition, not a general social network. Everything stays tied to practice: a post is about a question, a topic, a score or an exam. The product must stay safe for students, many of whom are minors or 18-22 year olds in a placement season.

## Reference platforms (borrow the idea, not the clutter)

| Platform | Take this | Leave this |
|---|---|---|
| **LeetCode Discuss / Contest** | Topic-tagged posts, upvotes, sort by Hot / New / Top, solution-sharing norms, contest hosting rules, a clear report flow | Long-lived posts and endless threads; they rot and need heavy moderation |
| **Codeforces** | Friends list with a "friends only" standings filter, rating next to the handle, gym / private contests with invite links | Dense, intimidating UI |
| **HackerRank / HackerEarth** | Private contests with an access code, host dashboard, public vs unlisted | Recruiter-first flows |
| **Duolingo** | Follow / friends feed of activity ("Asha finished her daily set"), friend streak nudges, weekly league promotion | Gamification that nags or shames |
| **Chess.com / Lichess** | Direct 1v1 challenge with accept / decline / expire, rematch | Real-time play; ours is asynchronous |
| **Snapchat / BeReal** | Ephemeral content with a visible countdown so users post freely | Anything that hides abuse from moderators |

## Before you start

Read these so you follow existing patterns. Don't invent new ones.

1. `README.md`, `backend/README.md`, `supabase/README.md`, `docs/ROADMAP.md` (cohorts / organisations section), `docs/SECURITY-AUDIT.md`, `prompts/frontend-redesign/BRAND.md`.
2. Backend: `backend/src/app.js`, `db.js` (`asUser`, `query`), `routes/rpc.js` (the `RPCS` allow-list), `routes/me.js`, `middleware/auth.js` (`requireUser`), `middleware/rateLimit.js` (`hit`), `routes/cron.js` + `push/jobs.js` + `push/messages.js` + `push/sender.js` (notifications and scheduled jobs), `entitlements.js` (plans and limits), `personalSet.js`.
3. Database: `supabase/migrations/20261001000002_profiles.sql` (handles, profiles), `…000004_activity.sql`, `…000005_rls.sql`, `…000008_gameplay_rpcs.sql` (`private.record_attempt`, `private.resolve_attempt_scope`, scoring), `…000014_progression.sql` (XP, leagues, ratings), `…000015_learner_app.sql` (contests, entries, answers), `20261006000001_admin_contests.sql` (contest authoring and audit triggers), `20261007000001_exam_integrity.sql`, `20261008000001_personal_daily_sets.sql`, `20261010000001_push_notifications.sql`, `20261011000001_plans_entitlements.sql`, and `supabase/tests/database/*` for the pgTAP style.
4. Frontend: `src/App.tsx`, `src/lib/{api,http,queries,types,routes}.ts`, `src/components/compete/*`, `src/components/profile/*`, `src/components/layout/*`, `src/components/ui/*`, `src/pages/*` (Compete, Profile, Leaderboard), `src/admin/ContestEditor.jsx`, and the e2e fixtures in `frontend/e2e/fixtures/*`.

**Invariants you must not break.**
- Every game rule stays in Postgres (RLS + `SECURITY DEFINER` functions run as the signed-in user). The API is a thin gateway.
- The browser never receives an answer key before the user has spent their one scoring attempt. A challenge, league or hosted contest reuses the **same** grading, timing and integrity path; it never grades on the client.
- All existing tests keep passing. New tables get RLS on from the first migration, with no `using (true)` policies.
- Ask before adding any dependency. Prefer none.

## Build in four slices, one PR-sized commit set each

Do them in this order and keep each shippable on its own. Stop after each slice, run the checks (see "Definition of done") and summarise before starting the next.

---

### Slice 1: Follow / friends

**Model.** Asymmetric follow (like Codeforces / Duolingo), with "friends" derived as mutual follows.

- `public.follows (follower_id, followee_id, created_at)`, PK `(follower_id, followee_id)`, check `follower_id <> followee_id`, index on `followee_id`.
- Optional approval for private accounts: `profiles.is_private bool default false`, plus `follow_requests` (pending → accepted / declined). Public accounts auto-accept.
- `public.blocks (blocker_id, blocked_id)`. A block removes follows both ways and hides each user from the other everywhere (search, feeds, challenges, leagues, post authors).
- RPCs (`SECURITY DEFINER`, `search_path = ''`, check `auth.uid()`): `follow_user(handle)`, `unfollow_user(handle)`, `respond_follow_request(id, accept)`, `block_user(handle)`, `unblock_user(handle)`, `get_followers(handle, cursor)`, `get_following(handle, cursor)`, `search_users(q, cursor)` (handle prefix, rate limited, never returns email or real name unless the user opted in), `get_friend_activity(cursor)`.
- **Caps and abuse control:** max 1,000 following; follow / unfollow rate limits (e.g. 60 per hour, 300 per day); no follow-back spam loops (dedupe notifications within 24h).
- **Privacy defaults:** profile shows handle, avatar, level, league, streak, rating. Hide exact accuracy, exam target and college unless `profile_visibility` allows it (`everyone | followers | friends | nobody`, per field group).
- **Friend activity feed** (opt-out per user): server-built from real events only, never free text: "finished today's set (9/10)", "reached Gold league", "7-day streak", "won a challenge". Retention window 14 days.
- **UI:** "Follow" button on profiles and leaderboard rows, Followers / Following lists, a "Friends" filter on the leaderboard and contest standings (the Codeforces idea), a user search sheet, block / report in the profile menu, and an empty state that suggests people from the same league or college.

---

### Slice 2: Community posts with a 48-hour life

**Behaviour.** Short posts that auto-expire exactly 48 hours after creation. No edits that extend life, no pinning past 48h, no resurrection.

- `public.posts` (id, author_id, kind `question | tip | win | study_buddy | poll`, body ≤ 500 chars (plain text + very limited Markdown, KaTeX allowed), `question_id` nullable, `topic_id` nullable, `exam_tag` nullable, `created_at`, `expires_at generated always as (created_at + interval '48 hours') stored`, `like_count`, `reply_count`, `report_count`, `status` `visible | hidden | removed`).
- `public.post_replies` (flat, one level only, ≤ 280 chars, same expiry as the parent: `expires_at` copies the parent) and `public.post_reactions` (one per user per post, a small fixed set such as 👍 🔥 💡).
- **Expiry is enforced in two places:**
  1. **Read time (source of truth):** every read policy and RPC includes `expires_at > now()`. A post past its life is invisible even if the cleanup job is late.
  2. **Cleanup:** a scheduled job (reuse `routes/cron.js` + `private` job pattern from `…000009_scheduled_jobs.sql`) hard-deletes expired posts, replies and reactions in batches every 15 minutes, including their media and any report rows no longer needed. Reports against a removed post keep a **minimal moderation snapshot for 30 days** (author id, body hash, reason), so repeat offenders can still be actioned.
- **Countdown in the UI:** each card shows time left ("expires in 5h 12m"), turns amber under 6h and is removed from the list live when it hits zero (no stale cards). Replies carry no extra time.
- **Feeds:** `Following` (people I follow), `My college / batch`, `Topic` and `Everyone`, each sorted `New` (default) or `Hot`. Hot is a time-decayed score such as `(likes + 2*replies) / (age_hours + 2)^1.5`. Cursor pagination, 20 per page.
- **Posting rules and limits:** 5 posts and 30 replies per day per user (tunable in the `plans` table via `entitlements.js`, no deploy needed). Users with accounts younger than 24h or no completed daily set can reply but not post. Daily rate limit via `hit('post', userId, …)`.
- **Spoiler safety (important for an aptitude app):** a post that links a `question_id` must **not** reveal that question's answer to people who haven't attempted it. Render the linked question card through the normal solve path. Detect likely answer leaks (regex for "answer is", option letters, final numbers from the key) and require the author to tick "Contains spoiler", which blurs the post until tapped. During a live contest, posts that link a contest question are blocked.
- **Moderation, minimum viable:** report (spam, abuse, answer leak, personal info, other), auto-hide at 3 distinct reporters pending review, banned-words / link filter (no external links unless the user is verified), mute and block from Slice 1, admin queue in `src/admin/` mirroring the review queue, audit log entry for every moderation action, shadow limits for repeat offenders.
- **Data protection:** ephemeral posts are not private. Say so in the composer ("Visible to everyone for 48 hours"), never store IPs in the post table, and allow an author to delete early.

---

### Slice 3: 1v1 "Beat my score" challenge and private leagues

#### 3a. 1v1 challenge on a set (async, Chess.com-style accept flow)

- `public.challenges` (id, challenger_id, opponent_id, `set_kind` `daily | practice_topic | custom_set`, `set_ref`, `question_ids uuid[]` frozen at creation, `challenger_score`, `challenger_time_ms`, `status` `pending | accepted | completed | declined | expired | cancelled`, `winner_id`, `created_at`, `accept_by` = created + 48h, `complete_by` = accepted + 24h, `rematch_of`).
- Flow: the challenger **plays the set first** (their score and time are locked in), then sends "Beat my score: 8/10 in 4:12" to a friend or via a share link. The opponent sees the set and the target, accepts, plays the **identical question list** under the same timing rules, and the result card shows both.
- Rules in SQL: winner = higher correct count, ties broken by total time, then by fewer hints; a tie after that is a draw. XP: small bonus to the winner, participation XP to both, capped at 5 rewarded challenges per day to prevent farming and collusion. No rating change in v1.
- **Fairness and anti-cheat:** reuse the exam-integrity path (server timers, one scoring attempt, no tutor during the run). The opponent cannot see questions before accepting and starting the timer. Frozen question ids are served only to the two participants. Same pair is limited to 3 challenges per day. Duplicate score farming from the same device pair is flagged in an `integrity_events` row.
- RPCs: `create_challenge`, `accept_challenge`, `decline_challenge`, `cancel_challenge`, `get_challenge`, `list_challenges(status, cursor)`, `request_rematch`. All gate on friends or an explicit share token, and block if either user blocked the other.
- Notifications through the existing push stack: "Asha challenged you: beat 8/10", "Your challenge expires in 6h", "You won / lost". Respect quiet hours and per-type opt-outs.
- UI: "Challenge" button on a friend's profile and after finishing any set ("Challenge a friend to beat this"), a Challenges tab (Incoming / Outgoing / Completed), a head-to-head result screen with a Rematch button, and a shareable link card.

#### 3b. Private leagues for a college or batch

This is **not** the weekly Bronze → Diamond ladder. It is a separate, invite-only group that sits **on top of** the existing XP data.

- `public.groups` (id, name, slug, `kind` `college | batch | friends | coaching`, owner_id, `join_mode` `invite_code | approval | email_domain`, `invite_code` (rotatable), `allowed_email_domain` nullable, `max_members` default 300, `is_archived`, created_at) and `public.group_members` (group_id, user_id, `role` `owner | admin | member`, `status` `active | pending | removed`, joined_at).
- **Scoring (computed in SQL, never client-side):** leaderboard window `weekly | monthly | all_time | custom range`, metric default **XP earned in the window** (so a late joiner can still compete), with tiebreakers: more correct answers, then earlier achievement. Show rank, delta vs last week, streak and "most improved". Use a materialised or incrementally maintained aggregate so reads stay O(page), not O(members × attempts) (see `docs/SCALING.md`).
- Admin tools for the owner / admins: rename, rotate invite code, approve or remove members, set a season (start / end) and a weekly reset, post an **announcement** (pinned, up to 280 chars, **not** subject to the 48h rule because it is an official notice), export results as CSV, and archive the league.
- **Verification for colleges:** `email_domain` join mode requires a verified email on that domain (reuse the auth mailer) so "IIT-X 2026 batch" really is that batch. Show a verified badge. A user may belong to at most 10 groups.
- **Safety:** a group is invisible to non-members (no public listing in v1; join only by code, link or approval). Removing someone removes their data from the league view immediately. Owners cannot read members' answers, only the aggregated score.
- UI: Leagues hub (my leagues + "Join with code"), league page with Leaderboard / Activity / Challenges (members can 1v1 each other) / Announcements tabs, a "Share invite" sheet (copy link, QR optional), and an admin settings panel.
- The 48h Community feed gets a `My college / batch` tab powered by group membership, so each group effectively has an ephemeral chat board.

---

### Slice 4: User-hosted contests

Reuse the **existing** contest engine (`contests`, `contest_items`, `contest_entries`, `contest_answers`, integrity checks, admin editor). Don't write a second one. Add ownership and visibility on top.

- Extend `contests` with `host_id` (null = Aptric official), `visibility` `public | unlisted | group`, `group_id` nullable, `access_code` nullable (hashed), `max_participants`, `status` `draft | scheduled | live | ended | cancelled`, `host_review_state` `none | pending | approved | rejected`.
- **Who can host:** a user must pass a gate (e.g. level ≥ 5, verified email, ≥ 30 days old, no active moderation strikes) or be a group admin hosting for their group. Plus-plan limits via `entitlements.js` (e.g. free: 2 contests per month with ≤ 50 participants; higher on paid plans), changeable in the `plans` table.
- **Question sources:** hosts choose only from **published, verified Aptric questions** via the existing question picker (filter by section, topic, difficulty, exclude questions the host themselves authored or recently used). Hosts cannot upload their own questions in v1; that avoids unverified answer keys, copyright problems and leaks. Add a "uses N questions you've already seen" warning only for the host.
- **Visibility and approval:** `public` contests go through a light **admin approval** queue (reuse the review queue UI) before appearing in the global listing; `unlisted` and `group` contests start immediately and are reachable only by link / code / membership. Admins can cancel or hide any hosted contest, with an audit log entry.
- **Integrity and fairness:** identical rules for all participants (fixed `starts_at` / `ends_at`, server timers, tutor locked, one attempt per question, shuffled option order per user if the existing engine supports it). The host sees the dashboard (registrations, live participation count, completion), but **not** the answer key and **not** individual answers until the contest ends. The host can participate only if the contest is marked "unrated / host plays for fun" and is excluded from prizes.
- **Results:** standings by score, then time, then fewer hints, with a **Friends** filter and a **Group** filter. Final standings are frozen at `ends_at`. Ratings and XP only count for `public` and `group` contests with ≥ 5 participants, with a per-day cap, to prevent two-account rating farming.
- **Lifecycle:** reminders at 24h and 1h before start through the push stack, "starts in" countdown, late join allowed until a configurable grace period, post-contest results page, and the host gets a summary (participation, hardest question by accuracy, average time).
- **Abuse:** report a contest, host strike system (2 strikes lose hosting for 30 days), rate limits on create and publish, no contest start earlier than 1 hour from creation (time for moderation and notification).

---

## Cross-cutting requirements

**Schema and security.**
- One migration per slice, named `supabase/migrations/<next-timestamp>_<slice>.sql`, idempotent where practical. Mirror the existing header-comment style.
- All new RPCs go in the `RPCS` allow-list in `backend/src/routes/rpc.js`; validate every argument at the API boundary.
- RLS on every table, users read only what the relationship allows (self, follower, friend, group member, host, admin). Add pgTAP tests for each policy, including negative cases (blocked user, expired post, non-member, non-host).
- Defend against IDOR, enumeration (consistent responses for "user not found" and "blocked"), mass assignment, and race conditions (use `INSERT … ON CONFLICT`, row locks on accept / complete, and unique constraints rather than app-level checks).
- Rate-limit every write endpoint with `hit(...)`, and cap list page sizes server-side.

**Notifications.** Extend `push/messages.js` and `push/jobs.js` for: new follower, follow request, challenge received / expiring / result, league announcement, contest reminder, and "your post is about to expire" (opt-in only). Add per-category toggles to settings and respect them in the sender.

**Frontend.**
- New routes under `src/lib/routes.ts`, lazy-loaded, with loading, empty and error states for every list. Use the existing `ui/*` components, `queries.ts` cache conventions, toasts and the brand tokens in `BRAND.md`. Mobile-first, keyboard accessible, `prefers-reduced-motion` respected, no layout shift from the countdown.
- Optimistic updates for follow, like and reaction with rollback on error.
- Never render user text as HTML. Run bodies through the existing `Markdown` component with a strict allow-list (no images, no raw HTML, links only if verified).

**Feature flags and rollout.** Gate each slice behind a flag (env or `plans`/settings table) so it can ship dark, then enable for a pilot college first.

**Out of scope (don't build).** Direct messages, group chat, image or video uploads, user-written questions, cash prizes or paid contests, public discovery of private groups, live head-to-head play, and anything that needs a new third-party service.

## Definition of done

1. **Tests:** backend (`node --test` as in `backend/package.json`), pgTAP in `supabase/tests/database/`, frontend unit tests (Vitest) for countdown / expiry formatting, feed sorting and challenge result logic, and Playwright e2e with mocked API for: follow → feed, post → countdown → expiry, challenge accept → result, join league by code, host → publish → join contest.
2. **Required test cases include:** a post is invisible the second after `expires_at` even if the cleanup job hasn't run; the cleanup job is idempotent and batch-safe; a blocked user cannot see, follow, challenge or invite; a challenge cannot be accepted twice or after expiry (race-tested); an opponent never sees questions before accepting; league scores can't be altered by owners; a contest host cannot read the answer key; per-day XP and rating caps hold under concurrent requests.
3. Lint, typecheck and build pass for both `backend/` and `frontend/`; CI (`.github/workflows/ci.yml`) is green; existing a11y specs still pass.
4. Docs updated: `backend/README.md` (new endpoints, env), `supabase/README.md`, and a short "Community & safety" section in the root `README.md` describing the 48h rule, privacy defaults and moderation flow.
5. Finish each slice with a short summary: what shipped, files touched, decisions you made where this brief was silent, and anything you deliberately left out.

If something here conflicts with an existing invariant or would require a risky change (for example weakening RLS, or exposing the answer key), **stop and ask** rather than guessing.
