#!/usr/bin/env node
// Migrates v1 users, their score/streak/attempt history and feedback into v2.
//
//   node supabase/scripts/import-v1-users.mjs [options] v1-users.ndjson > v1-users.sql
//   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f v1-users.sql
//
// Input is the NDJSON written by export-v1-users.sql. Like
// import-v1-questions.mjs, this never connects to either database: it writes
// one transactional SQL script, to be run as `postgres` (direct or session
// pooler connection; the script writes auth.users and toggles a trigger).
// The full runbook, including the cutover checklist, is supabase/MIGRATION.md.
//
// What the script does, in one transaction:
//   1. auth.users + an 'email' auth.identities row per v1 user, with the v1
//      bcrypt hash as encrypted_password (Supabase Auth verifies bcrypt
//      natively, so passwords keep working). Google users get no Google
//      identity: Supabase links it by email on their first Google sign-in.
//      If a v2 account already has that email, it is kept and reused.
//   2. private.v1_user_import: v1 user_id -> auth user id.
//   3. profiles (filled by the signup trigger from user metadata, then
//      updated): handle, name, avatar, bio, role, ban, created_at, and the
//      streak recomputed from v1 daily-set history.
//   4. xp_events: one 'legacy_import' event per user with a v1 score > 0,
//      amount = score, the v1 attempt history in metadata; profiles.xp (and so
//      level and earned streak freezes) follows. The league trigger is off for
//      this insert, so legacy XP never lands in this week's league.
//   5. feedback, with private.v1_feedback_import mapping v1 -> v2 ids.
//   6. A verification report (expected vs actual, counts per table); any
//      mismatch raises and rolls everything back.
//
// Options:
//   --out <file>        write SQL here instead of stdout
//   --report <file>     per-user CSV: planned outcome, skip reason, handle, XP, streak
//   --dry-run           the script ends in ROLLBACK: runs every step and the
//                       report against the real database, changes nothing
//   --verify            emit only the read-only verification report (run it
//                       after the import, or any time later)
//   --today <date>      local "today" for streaks (default: today in --timezone)
//   --timezone <tz>     timezone for imported profiles and streak days
//                       (default Asia/Kolkata, which v1 used for its days)
//
// Re-runnable: v1 users already in private.v1_user_import and v1 feedback
// already in private.v1_feedback_import are skipped, so a newer export only
// adds what is missing.

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Fixed namespace: the same v1 user_id always gets the same auth user id.
const ID_NAMESPACE = '0b7f6a7e-5d1c-4c2e-9f3a-2a6c1d8e4b90';

const SKIP_REASONS = {
  invalid_email: 'email missing or malformed',
  duplicate_email: 'another v1 user has the same email (case-insensitive); the oldest account wins',
  unverified: 'never verified their email and has no Google sign-in (v1 refused their logins)',
};

const STREAK_BADGES = [['streak-7', 7], ['streak-30', 30], ['streak-100', 100]];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function uuidV5(name, namespace = ID_NAMESPACE) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(String(name), 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Supabase Auth (GoTrue) checks passwords with Go's bcrypt, which reads the
// $2a$ / $2b$ / $2y$ hashes node's bcrypt and bcryptjs write.
export function isBcrypt(hash) {
  return typeof hash === 'string' && /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/.test(hash);
}

export function toBool(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

// Postgres char_length counts code points, not UTF-16 units.
function clip(s, max) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t) return null;
  return Array.from(t).slice(0, max).join('');
}

function isoTimestamp(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
}

const dayNumber = (d) => Date.parse(`${d}T00:00:00Z`) / 86400000;

export function localToday(timezone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now);
}

// days: the dates a user played their daily set. The streak is the run of
// consecutive days ending at the last one; it is still live only if that day
// is today or yesterday (the same rule as private.bump_streak / settle_streak).
export function computeStreak(days, today) {
  const sorted = [...new Set(days.map(isoDate).filter(Boolean))].sort();
  if (sorted.length === 0) return { current: 0, longest: 0, last: null };
  let run = 1;
  let longest = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = dayNumber(sorted[i]) - dayNumber(sorted[i - 1]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const last = sorted[sorted.length - 1];
  return { current: dayNumber(today) - dayNumber(last) <= 1 ? run : 0, longest, last };
}

// v1 handles are "<name slug, max 24>-<8 hex>" (makeHandle in
// backend/src/utils/helpers.js); v2 wants ^[a-z0-9_]{3,24}$. Keep the v1
// handle with '_' for '-' when it fits, else shorten the slug and keep 5 hex
// of the suffix. Returns null when nothing usable is left; the player then
// picks a handle on /onboarding.
export function v2Handle(v1Handle) {
  const raw = String(v1Handle || '').toLowerCase().trim();
  const direct = raw.replace(/-/g, '_').replace(/[^a-z0-9_]/g, '');
  if (/^[a-z0-9_]{3,24}$/.test(direct)) return direct;
  const m = /^(.*)-([0-9a-f]{8})$/.exec(raw);
  if (!m) return null;
  let base = m[1].replace(/-+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 18).replace(/_+$/, '');
  if (base.length < 1) base = 'user';
  const candidate = `${base}_${m[2].slice(0, 5)}`;
  return /^[a-z0-9_]{3,24}$/.test(candidate) ? candidate : null;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export function parseNdjson(text, source = 'input') {
  const records = { user: [], attempts: [], streak_day: [], feedback: [], totals: [] };
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (err) {
      throw new Error(`${source}:${i + 1}: not JSON (${err.message})`);
    }
    if (!obj || !(obj.t in records)) throw new Error(`${source}:${i + 1}: unknown record kind ${JSON.stringify(obj?.t)}`);
    records[obj.t].push(obj);
  });
  return records;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export function planImport(records, { today, timezone = 'Asia/Kolkata' } = {}) {
  today = today || localToday(timezone);
  const attempts = new Map(records.attempts.map((a) => [String(a.user_id), a]));
  const streakDays = new Map();
  for (const r of records.streak_day) {
    const id = String(r.user_id);
    if (!streakDays.has(id)) streakDays.set(id, []);
    streakDays.get(id).push(r.d);
  }

  // Oldest account first: it wins duplicate emails and handle collisions.
  const v1Users = [...records.user].sort((a, b) =>
    String(a.created_at || '9999').localeCompare(String(b.created_at || '9999'))
    || String(a.user_id).localeCompare(String(b.user_id)));

  const users = [];
  const skipped = [];
  const emails = new Set();
  const handles = new Set();

  for (const u of v1Users) {
    const v1Id = String(u.user_id);
    const email = String(u.email || '').trim().toLowerCase();
    const google = u.google_id ? String(u.google_id).trim() || null : null;
    const verified = toBool(u.is_verified);
    const base = { v1_user_id: v1Id, email, score: Math.max(0, toInt(u.score)) };

    let reason = null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) reason = 'invalid_email';
    else if (emails.has(email)) reason = 'duplicate_email';
    else if (!verified && !google) reason = 'unverified';
    if (reason) {
      skipped.push({ ...base, reason });
      continue;
    }
    emails.add(email);

    const notes = [];
    let passwordHash = null;
    if (u.password_hash) {
      if (isBcrypt(u.password_hash)) passwordHash = u.password_hash;
      else notes.push('password hash is not bcrypt: imported without a password (reset or magic link)');
    }
    const v1Auth = passwordHash && google ? 'password+google' : passwordHash ? 'password' : google ? 'google' : 'none';

    let handle = v2Handle(u.handle);
    if (handle && handles.has(handle)) handle = null;
    if (handle) handles.add(handle);
    else notes.push('no usable handle: picks one on /onboarding');

    const streak = computeStreak(streakDays.get(v1Id) || [], today);
    const v1Streak = toInt(u.day_streak, 0);
    if (streak.current !== v1Streak) notes.push(`v1 day_streak ${v1Streak} recomputed as ${streak.current}`);

    const a = attempts.get(v1Id);
    const history = a ? {
      total: toInt(a.total), correct: toInt(a.correct), wrong: toInt(a.wrong),
      hint_used: toInt(a.hint_used), gave_up: toInt(a.gave_up), points: toInt(a.points),
      first_date: isoDate(a.first_date), last_date: isoDate(a.last_date),
    } : { total: 0, correct: 0, wrong: 0, hint_used: 0, gave_up: 0, points: 0, first_date: null, last_date: null };
    if (history.total > 0 && base.score === 0) notes.push('attempts but score 0: no legacy XP event');

    const avatar = clip(u.profile_pic, 2048);
    users.push({
      ...base,
      new_id: uuidV5(`user:${v1Id}`),
      password_hash: passwordHash,
      v1_auth: v1Auth,
      google_id: google,
      handle,
      display_name: clip(u.user_name, 64),
      avatar_url: avatar && /^https:\/\//i.test(avatar) ? avatar : null,
      bio: clip(u.bio, 280),
      role: u.role === 'admin' ? 'admin' : 'user',
      banned: toBool(u.is_banned),
      created_at: isoTimestamp(u.created_at),
      last_login: isoTimestamp(u.last_login),
      day_streak: v1Streak,
      current_streak: streak.current,
      longest_streak: streak.longest,
      last_streak_date: streak.last,
      attempts: { ...history, questions_solved: toInt(u.questions_solved), questions_attempted: toInt(u.questions_attempted) },
      notes: notes.join('; ') || null,
    });
  }

  const feedback = records.feedback.map((f) => {
    const rating = Math.round(Number.parseFloat(f.rating));
    return {
      v1_feedback_id: toInt(f.feedback_id),
      new_id: uuidV5(`feedback:${f.feedback_id}`),
      v1_user_id: f.user_id == null ? null : String(f.user_id),
      rating: rating >= 1 && rating <= 5 ? rating : null,
      message: clip(f.comment, 5000) || '(rating only)',
      created_at: isoTimestamp(f.created_at),
    };
  });

  const totals = records.totals[0] || {};
  const expected = {
    v1_users: totals.users == null ? null : toInt(totals.users),
    v1_feedback: totals.user_feedback == null ? null : toInt(totals.user_feedback),
    v1_score_sum: totals.score_sum == null ? null : toInt(totals.score_sum),
    exported_users: records.user.length,
    exported_feedback: records.feedback.length,
    exported_score_sum: records.user.reduce((s, u) => s + Math.max(0, toInt(u.score)), 0),
  };
  return { users, skipped, feedback, expected, today, timezone, exportedAt: totals.exported_at || null };
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

function dollarQuote(text) {
  let tag;
  do tag = `$v1_${randomBytes(4).toString('hex')}$`; while (text.includes(tag));
  return `${tag}${text}${tag}`;
}

function jsonRows(rows) {
  // One row per line keeps the generated file diffable and greppable.
  return dollarQuote(`[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]`);
}

const STAGE_SQL = (plan) => `
-- ---------------------------------------------------------------------------
-- Staged export (${plan.users.length} users, ${plan.feedback.length} feedback rows)
-- ---------------------------------------------------------------------------
create temp table v1_stage_users on commit drop as
select * from jsonb_to_recordset(${jsonRows(plan.users)}::jsonb) as x (
  v1_user_id text, new_id uuid, email text, password_hash text, v1_auth text, google_id text,
  handle text, display_name text, avatar_url text, bio text, role text, banned boolean,
  created_at timestamptz, last_login timestamptz, score integer, day_streak integer,
  current_streak integer, longest_streak integer, last_streak_date date, attempts jsonb, notes text
);
alter table v1_stage_users add primary key (v1_user_id);

create temp table v1_stage_feedback on commit drop as
select * from jsonb_to_recordset(${jsonRows(plan.feedback)}::jsonb) as x (
  v1_feedback_id integer, new_id uuid, v1_user_id text, rating smallint, message text, created_at timestamptz
);

-- Counts taken from the v1 database by export-v1-users.sql, and by this script.
create temp table v1_expected (key text primary key, value bigint) on commit drop;
insert into v1_expected values
${[
    ...Object.entries(plan.expected).map(([k, v]) => [k, v]),
    ...Object.keys(SKIP_REASONS).map((r) => [`skipped_${r}`, plan.skipped.filter((s) => s.reason === r).length]),
  ].map(([k, v]) => `  (${lit(k)}, ${v == null ? 'null' : v})`).join(',\n')};
`;

const IMPORT_SQL = (plan) => `
-- ---------------------------------------------------------------------------
-- Preflight: the bookkeeping migration is applied, and auth.users /
-- auth.identities still have the columns this script writes.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('private.v1_user_import') is null then
    raise exception 'private.v1_user_import is missing: apply migration 20261001000016_v1_user_import.sql first';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'auth' and table_name = 'users'
        and column_name in ('instance_id', 'id', 'aud', 'role', 'email', 'encrypted_password', 'email_confirmed_at',
                            'confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
                            'raw_app_meta_data', 'raw_user_meta_data', 'created_at', 'updated_at',
                            'last_sign_in_at', 'banned_until')) <> 17
     or (select count(*) from information_schema.columns
         where table_schema = 'auth' and table_name = 'identities'
           and column_name in ('provider_id', 'user_id', 'identity_data', 'provider',
                               'last_sign_in_at', 'created_at', 'updated_at')) <> 7 then
    raise exception 'auth.users / auth.identities do not have the expected columns; check the Supabase Auth version';
  end if;
end $$;

create temp table v1_counts_before on commit drop as
select 'auth.users' as tbl, count(*) as n from auth.users
union all select 'auth.identities', count(*) from auth.identities
union all select 'public.profiles', count(*) from public.profiles
union all select 'public.xp_events', count(*) from public.xp_events
union all select 'public.user_badges', count(*) from public.user_badges
union all select 'public.feedback', count(*) from public.feedback
union all select 'public.league_members', count(*) from public.league_members
union all select 'public.league_members xp sum', coalesce(sum(xp), 0) from public.league_members
union all select 'private.v1_user_import', count(*) from private.v1_user_import
union all select 'private.v1_feedback_import', count(*) from private.v1_feedback_import;

-- ---------------------------------------------------------------------------
-- 1. Users not imported yet, and the v2 account that already has their email.
-- ---------------------------------------------------------------------------
create temp table v1_todo on commit drop as
select s.*, u.id as existing_id
from v1_stage_users s
left join auth.users u on lower(u.email) = s.email
where not exists (select 1 from private.v1_user_import m where m.v1_user_id = s.v1_user_id);

-- ---------------------------------------------------------------------------
-- 2. Auth users (password hash carried over) and their email identities.
--    The signup trigger (private.handle_new_user) creates each profile from
--    the metadata, taking the handle only if it is valid and unclaimed.
--    Token columns must be '' rather than NULL for Supabase Auth.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at, banned_until
)
select '00000000-0000-0000-0000-000000000000', t.new_id, 'authenticated', 'authenticated', t.email,
       coalesce(t.password_hash, ''), coalesce(t.created_at, now()),
       '', '', '', '',
       jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
       jsonb_strip_nulls(jsonb_build_object('handle', t.handle, 'display_name', t.display_name,
                                            'avatar_url', t.avatar_url, 'timezone', ${lit(plan.timezone)})),
       coalesce(t.created_at, now()), now(), t.last_login,
       case when t.banned then now() + interval '100 years' end
from v1_todo t
where t.existing_id is null
order by t.created_at nulls last, t.v1_user_id;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select t.new_id::text, t.new_id,
       jsonb_build_object('sub', t.new_id::text, 'email', t.email, 'email_verified', true, 'phone_verified', false),
       'email', t.last_login, coalesce(t.created_at, now()), now()
from v1_todo t
where t.existing_id is null;

-- ---------------------------------------------------------------------------
-- 3. v1 user_id -> auth user id.
-- ---------------------------------------------------------------------------
insert into private.v1_user_import (
  v1_user_id, user_id, email, outcome, v1_auth, v1_google_id, v1_score, starting_xp,
  v1_day_streak, current_streak, longest_streak, last_streak_date, notes
)
select t.v1_user_id, coalesce(t.existing_id, t.new_id), t.email,
       case when t.existing_id is null then 'created' else 'existing' end,
       t.v1_auth, t.google_id, t.score, t.score,
       t.day_streak, t.current_streak, t.longest_streak, t.last_streak_date, t.notes
from v1_todo t;

-- ---------------------------------------------------------------------------
-- 4. Profiles. New accounts take everything from v1. Accounts that already
--    existed in v2 keep what they have: v1 only fills empty fields, and the v1
--    streak applies only if they have never played a v2 daily set.
--    Raising current_streak fires the streak-badge trigger; longest-streak
--    badges are backfilled below, as 20261001000014_progression.sql did.
-- ---------------------------------------------------------------------------
update public.profiles p
set created_at       = coalesce(t.created_at, p.created_at),
    bio              = t.bio,
    role             = t.role::public.user_role,
    banned_at        = case when t.banned then now() end,
    banned_reason    = case when t.banned then 'Banned in v1' end,
    longest_streak   = t.longest_streak,
    current_streak   = t.current_streak,
    last_streak_date = t.last_streak_date
from v1_todo t
where t.existing_id is null and p.id = t.new_id;

update public.profiles p
set display_name     = coalesce(p.display_name, t.display_name),
    avatar_url       = coalesce(p.avatar_url, t.avatar_url),
    bio              = coalesce(p.bio, t.bio),
    banned_at        = case when t.banned then coalesce(p.banned_at, now()) else p.banned_at end,
    banned_reason    = case when t.banned and p.banned_at is null then 'Banned in v1' else p.banned_reason end,
    longest_streak   = greatest(p.longest_streak, t.longest_streak),
    current_streak   = case when p.last_streak_date is null then t.current_streak else p.current_streak end,
    last_streak_date = coalesce(p.last_streak_date, t.last_streak_date)
from v1_todo t
where t.existing_id is not null and p.id = t.existing_id;

update auth.users u
set banned_until = now() + interval '100 years'
from v1_todo t
where t.existing_id is not null and t.banned and u.id = t.existing_id;

insert into public.user_badges (user_id, badge)
select m.user_id, b.slug
from v1_todo t
join private.v1_user_import m on m.v1_user_id = t.v1_user_id
join (values ${STREAK_BADGES.map(([s, n]) => `(${lit(s)}, ${n})`).join(', ')}) b (slug, n) on t.longest_streak >= b.n
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. Legacy XP: one ledger row per user, then profiles.xp, whose trigger sets
--    level and grants streak freezes for each 500 XP milestone (max 2 held).
--    The league trigger is off so legacy XP doesn't count as this week's.
-- ---------------------------------------------------------------------------
alter table public.xp_events disable trigger xp_events_league;

with ins as (
  insert into public.xp_events (user_id, amount, reason, idempotency_key, metadata)
  select m.user_id, t.score, 'legacy_import', 'legacy_import:v1:' || t.v1_user_id,
         jsonb_build_object('source', 'v1', 'v1_score', t.score, 'attempts', t.attempts)
  from v1_todo t
  join private.v1_user_import m on m.v1_user_id = t.v1_user_id
  where t.score > 0
  on conflict (idempotency_key) do nothing
  returning user_id, amount
)
update public.profiles p
set xp = p.xp + ins.amount
from ins
where p.id = ins.user_id;

alter table public.xp_events enable trigger xp_events_league;

-- ---------------------------------------------------------------------------
-- 6. Feedback. v1 ratings (0.5 steps) are rounded; out-of-range ones dropped.
-- ---------------------------------------------------------------------------
create temp table v1_feedback_todo on commit drop as
select f.* from v1_stage_feedback f
where not exists (select 1 from private.v1_feedback_import x where x.v1_feedback_id = f.v1_feedback_id);

insert into public.feedback (id, user_id, category, rating, message, page, status, created_at, updated_at)
select f.new_id, m.user_id, 'general', f.rating, f.message, 'v1-import', 'read', coalesce(f.created_at, now()), now()
from v1_feedback_todo f
left join private.v1_user_import m on m.v1_user_id = f.v1_user_id;

insert into private.v1_feedback_import (v1_feedback_id, feedback_id, v1_user_id)
select f.v1_feedback_id, f.new_id, f.v1_user_id from v1_feedback_todo f;
`;

// Read-only checks of the database against the export. Every check is about
// this export's users and feedback, so it holds on a re-run and long after the
// cutover (except the streak check, which only means something at import).
const REPORT_SQL = (mode) => `
-- ---------------------------------------------------------------------------
-- Verification report
-- ---------------------------------------------------------------------------
create temp table v1_report (ord serial, section text, item text, expected bigint, actual bigint, ok boolean) on commit drop;

create temp view v1_mapped as
select s.*, m.user_id, m.outcome
from v1_stage_users s
join private.v1_user_import m on m.v1_user_id = s.v1_user_id;

insert into v1_report (section, item, expected, actual, ok)
select 'export', 'v1 users exported (export vs v1 table)', e1.value, e2.value, e1.value is null or e1.value = e2.value
from v1_expected e1, v1_expected e2 where e1.key = 'v1_users' and e2.key = 'exported_users'
union all
select 'export', 'v1 feedback exported (export vs v1 table)', e1.value, e2.value, e1.value is null or e1.value = e2.value
from v1_expected e1, v1_expected e2 where e1.key = 'v1_feedback' and e2.key = 'exported_feedback'
union all
select 'export', 'v1 score sum (export vs v1 table)', e1.value, e2.value, e1.value is null or e1.value = e2.value
from v1_expected e1, v1_expected e2 where e1.key = 'v1_score_sum' and e2.key = 'exported_score_sum'
union all
select 'export', 'skipped: ' || substr(key, 9), null, value, null from v1_expected where key like 'skipped_%'
union all
select 'users', 'users to import', null, (select count(*) from v1_stage_users), null
union all
select 'users', 'private.v1_user_import rows',
       (select count(*) from v1_stage_users), (select count(*) from v1_mapped), null
union all
select 'users', '  created by the import', null, (select count(*) from v1_mapped where outcome = 'created'), null
union all
select 'users', '  already had a v2 account (kept)', null, (select count(*) from v1_mapped where outcome = 'existing'), null
union all
select 'users', 'auth.users', (select count(*) from v1_mapped),
       (select count(*) from v1_mapped m join auth.users u on u.id = m.user_id), null
union all
select 'users', 'auth.identities (email) for created users', (select count(*) from v1_mapped where outcome = 'created'),
       (select count(*) from v1_mapped m
        where m.outcome = 'created'
          and exists (select 1 from auth.identities i where i.user_id = m.user_id and i.provider = 'email')), null
union all
select 'users', 'public.profiles', (select count(*) from v1_mapped),
       (select count(*) from v1_mapped m join public.profiles p on p.id = m.user_id), null
union all
select 'users', 'bcrypt hash carried over (created users)',
       (select count(*) from v1_mapped where outcome = 'created' and password_hash is not null),
       (select count(*) from v1_mapped m join auth.users u on u.id = m.user_id
        where m.outcome = 'created' and m.password_hash is not null and u.encrypted_password = m.password_hash), null
union all
select 'users', 'Google users (link on first Google sign-in)', null,
       (select count(*) from v1_mapped where v1_auth in ('google', 'password+google')), null
union all
select 'users', 'profiles without a handle (go through /onboarding)', null,
       (select count(*) from v1_mapped m join public.profiles p on p.id = m.user_id where p.handle is null), null
union all
select 'users', 'admins', (select count(*) from v1_mapped where outcome = 'created' and role = 'admin'),
       (select count(*) from v1_mapped m join public.profiles p on p.id = m.user_id
        where m.outcome = 'created' and m.role = 'admin' and p.role = 'admin'), null
union all
select 'users', 'banned', (select count(*) from v1_mapped where banned),
       (select count(*) from v1_mapped m join public.profiles p on p.id = m.user_id
        join auth.users u on u.id = m.user_id
        where m.banned and p.banned_at is not null and u.banned_until > now()), null
union all
select 'xp', 'legacy_import xp_events', (select count(*) from v1_mapped where score > 0),
       (select count(*) from v1_mapped m join public.xp_events e on e.idempotency_key = 'legacy_import:v1:' || m.v1_user_id), null
union all
select 'xp', 'legacy_import XP sum (= v1 score sum)', (select coalesce(sum(score), 0) from v1_mapped),
       (select coalesce(sum(e.amount), 0) from v1_mapped m
        join public.xp_events e on e.idempotency_key = 'legacy_import:v1:' || m.v1_user_id), null
union all
select 'xp', 'profiles.xp = xp_events ledger sum', (select count(*) from v1_mapped),
       (select count(*) from v1_mapped m join public.profiles p on p.id = m.user_id
        where p.xp = (select coalesce(sum(e.amount), 0) from public.xp_events e where e.user_id = m.user_id)), null
union all
select 'streaks', 'longest_streak at least v1 (created users)',
       (select count(*) from v1_mapped where outcome = 'created'),
       (select count(*) from v1_mapped m join public.profiles p on p.id = m.user_id
        where m.outcome = 'created' and p.longest_streak >= m.longest_streak), null
union all
select 'streaks', 'live streaks${mode === 'import' ? '' : ' (at import time only)'}',
       (select count(*) from v1_mapped where outcome = 'created' and current_streak > 0),
       (select count(*) from v1_mapped m join public.profiles p on p.id = m.user_id
        where m.outcome = 'created' and m.current_streak > 0 and p.current_streak = m.current_streak),
       ${mode === 'import' ? 'null' : 'true'}
union all
select 'feedback', 'public.feedback (v1 rows)', (select count(*) from v1_stage_feedback),
       (select count(*) from v1_stage_feedback f
        join private.v1_feedback_import x on x.v1_feedback_id = f.v1_feedback_id
        join public.feedback fb on fb.id = x.feedback_id), null
union all
select 'feedback', '  linked to an imported user', null,
       (select count(*) from v1_stage_feedback f
        join private.v1_feedback_import x on x.v1_feedback_id = f.v1_feedback_id
        join public.feedback fb on fb.id = x.feedback_id where fb.user_id is not null), null;

update v1_report set ok = (expected = actual) where ok is null and expected is not null;
${mode === 'import' ? `
-- Row counts per table before and after this run, and the change expected
-- from what was still to do. Legacy XP must not touch leagues.
insert into v1_report (section, item, expected, actual, ok)
select 'tables', b.tbl || ' (before ' || b.n || ', after ' || a.n || ')', d.expected, a.n - b.n, d.expected = a.n - b.n
from v1_counts_before b
join (
  select 'auth.users' as tbl, count(*) as n from auth.users
  union all select 'auth.identities', count(*) from auth.identities
  union all select 'public.profiles', count(*) from public.profiles
  union all select 'public.xp_events', count(*) from public.xp_events
  union all select 'public.user_badges', count(*) from public.user_badges
  union all select 'public.feedback', count(*) from public.feedback
  union all select 'public.league_members', count(*) from public.league_members
  union all select 'public.league_members xp sum', coalesce(sum(xp), 0) from public.league_members
  union all select 'private.v1_user_import', count(*) from private.v1_user_import
  union all select 'private.v1_feedback_import', count(*) from private.v1_feedback_import
) a using (tbl)
left join (
  select 'auth.users' as tbl, count(*) filter (where existing_id is null) as expected from v1_todo
  union all select 'auth.identities', count(*) filter (where existing_id is null) from v1_todo
  union all select 'public.profiles', count(*) filter (where existing_id is null) from v1_todo
  union all select 'public.xp_events', count(*) filter (where score > 0) from v1_todo
  union all select 'public.user_badges', null
  union all select 'public.feedback', count(*) from v1_feedback_todo
  union all select 'public.league_members', 0
  union all select 'public.league_members xp sum', 0
  union all select 'private.v1_user_import', count(*) from v1_todo
  union all select 'private.v1_feedback_import', count(*) from v1_feedback_todo
) d using (tbl)
order by b.tbl;
` : ''}
select section, item, expected, actual,
       case when ok then 'ok' when not ok then 'MISMATCH' else '' end as status
from v1_report order by ord;

do $$
declare
  bad text;
begin
  select string_agg(section || ': ' || item || ' (expected ' || expected || ', got ' || actual || ')', '; ')
  into bad from v1_report where ok = false;
  if bad is not null then
    raise exception 'v1 user import verification failed: %', bad;
  end if;
end $$;
`;

export function buildSql(plan, { mode = 'import' } = {}) {
  const header = `-- Generated by supabase/scripts/import-v1-users.mjs on ${new Date().toISOString()}
-- Export: ${plan.exportedAt || 'unknown time'}; ${plan.users.length} users to import, ${plan.skipped.length} skipped, ${plan.feedback.length} feedback rows.
-- Streaks as of ${plan.today} (${plan.timezone}).
-- Mode: ${mode === 'verify' ? 'VERIFY (read-only report; ends in ROLLBACK)' : mode === 'dry-run' ? 'DRY RUN (runs everything, then ROLLBACK)' : 'IMPORT (COMMIT)'}
-- Run as postgres: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <this file>
-- Contains emails and password hashes: do not commit it.

\\set ON_ERROR_STOP on
begin;
set local lock_timeout = '10s';
`;
  const body = STAGE_SQL(plan)
    + (mode === 'verify' ? '' : IMPORT_SQL(plan))
    + REPORT_SQL(mode === 'verify' ? 'verify' : 'import');
  const end = mode === 'import'
    ? `
commit;

-- Leaderboards pick up the legacy XP on the next 5-minute refresh; do it now.
select private.refresh_leaderboards();
`
    : '\nrollback;\n';
  return header + body + end;
}

// ---------------------------------------------------------------------------
// Report CSV
// ---------------------------------------------------------------------------

const csvCell = (v) => (v == null ? '' : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function buildReport(plan) {
  const head = ['v1_user_id', 'email', 'planned', 'reason', 'v1_auth', 'handle', 'starting_xp',
    'v1_day_streak', 'current_streak', 'longest_streak', 'last_streak_date', 'attempts', 'notes'];
  const rows = [
    ...plan.users.map((u) => [u.v1_user_id, u.email, 'import', '', u.v1_auth, u.handle, u.score,
      u.day_streak, u.current_streak, u.longest_streak, u.last_streak_date, u.attempts.total, u.notes]),
    ...plan.skipped.map((s) => [s.v1_user_id, s.email, 'skip', s.reason, '', '', s.score,
      '', '', '', '', '', SKIP_REASONS[s.reason]]),
  ];
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { files: [], mode: 'import', timezone: 'Asia/Kolkata' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--out') opts.out = value();
    else if (a === '--report') opts.report = value();
    else if (a === '--dry-run') opts.mode = 'dry-run';
    else if (a === '--verify') opts.mode = 'verify';
    else if (a === '--today') opts.today = value();
    else if (a === '--timezone') opts.timezone = value();
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else opts.files.push(a);
  }
  if (opts.today && !isoDate(opts.today)) throw new Error('--today must be YYYY-MM-DD');
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || opts.files.length === 0) {
    process.stderr.write('usage: import-v1-users.mjs [--dry-run | --verify] [--out file] [--report file] [--today YYYY-MM-DD] [--timezone tz] v1-users.ndjson\n');
    process.exit(opts.help ? 0 : 2);
  }
  const records = { user: [], attempts: [], streak_day: [], feedback: [], totals: [] };
  for (const f of opts.files) {
    const r = parseNdjson(readFileSync(f, 'utf8'), f);
    for (const k of Object.keys(records)) records[k].push(...r[k]);
  }
  const plan = planImport(records, { today: opts.today, timezone: opts.timezone });
  const sql = buildSql(plan, { mode: opts.mode });
  if (opts.out) writeFileSync(opts.out, sql);
  else process.stdout.write(sql);
  if (opts.report) writeFileSync(opts.report, buildReport(plan));

  const count = (pred) => plan.users.filter(pred).length;
  const lines = [
    `v1 users exported: ${records.user.length}${plan.expected.v1_users != null ? ` (v1 table: ${plan.expected.v1_users})` : ''}`,
    `  to import: ${plan.users.length}`,
    `    password: ${count((u) => u.v1_auth === 'password')}, google: ${count((u) => u.v1_auth === 'google')}, `
      + `password+google: ${count((u) => u.v1_auth === 'password+google')}, neither: ${count((u) => u.v1_auth === 'none')}`,
    `    legacy XP events: ${count((u) => u.score > 0)} (total ${plan.users.reduce((s, u) => s + u.score, 0)} XP)`,
    `    live streaks: ${count((u) => u.current_streak > 0)}; no usable handle: ${count((u) => !u.handle)}`,
    ...Object.keys(SKIP_REASONS).map((r) => `  skipped (${r}): ${plan.skipped.filter((s) => s.reason === r).length}`),
    `feedback rows: ${plan.feedback.length}`,
    `mode: ${opts.mode}; streaks as of ${plan.today} (${plan.timezone})`,
  ];
  process.stderr.write(lines.join('\n') + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
}
