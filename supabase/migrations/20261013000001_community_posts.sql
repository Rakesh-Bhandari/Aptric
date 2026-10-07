-- Community, slice 2: short posts that disappear 48 hours after they are written.
--
--   * posts / post_replies / post_reactions / poll_votes   the content (replies are flat, one level)
--   * post_reports                                          "report this post" (3 distinct reporters auto-hide it)
--   * moderation_snapshots                                  author id + body hash + reasons, kept 30 days after a
--                                                           reported or removed post is deleted
--   * mutes, community_banned_words                         per-player muting; the banned phrases list
--
-- The 48-hour rule is enforced twice:
--   1. Reads: every policy and every RPC checks expires_at > now(), so a post is invisible the second
--      it expires even if the cleanup job is late. expires_at is generated from created_at, created_at
--      cannot change, and nothing can edit a post (no edit RPC, and a trigger refuses it), so a post
--      can never be extended, pinned or brought back.
--   2. Cleanup: private.cleanup_expired_posts() hard-deletes expired posts (with their replies, reactions,
--      votes and reports) in batches; pg_cron runs it every 15 minutes. It is idempotent and skips
--      rows another run holds.
--
-- Every rule is here, in SECURITY DEFINER functions that check auth.uid(): limits (posts and replies per day
-- come from plans.limits so they can change without a deploy), the account-age and first-daily-set gate,
-- the banned words and links filter, spoiler safety and the moderation actions (all audited).

-- ---------------------------------------------------------------------------
-- Expiry: created_at + 48 hours. A fixed number of hours has no calendar or DST edge cases, so the
-- function is honestly immutable (a generated column needs that).
-- ---------------------------------------------------------------------------
create or replace function private.post_expires_at(ts timestamptz)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$
  select ts + interval '48 hours';
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.posts (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references public.profiles (id) on delete cascade,
  kind              text not null check (kind in ('question', 'tip', 'win', 'study_buddy', 'poll')),
  -- Plain text with very limited Markdown and KaTeX; the app renders it through a strict allow-list.
  body              text not null check (char_length(body) between 1 and 500),
  question_id       uuid references public.questions (id) on delete set null,
  topic_id          uuid references public.topics (id) on delete set null,
  exam_tag          text references public.tags (slug) on update cascade on delete set null,
  -- The author says it gives something away: hidden from people who have not attempted the question.
  contains_spoiler  boolean not null default false,
  poll_options      text[] check (poll_options is null or cardinality(poll_options) between 2 and 4),
  created_at        timestamptz not null default now(),
  expires_at        timestamptz generated always as (private.post_expires_at(created_at)) stored,
  like_count        integer not null default 0 check (like_count >= 0),
  reply_count       integer not null default 0 check (reply_count >= 0),
  report_count      integer not null default 0 check (report_count >= 0),
  status            text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  -- A moderator has looked at it: reports no longer auto-hide it.
  reviewed_at       timestamptz,
  check ((kind = 'poll') = (poll_options is not null))
);

comment on table public.posts is
  'Community posts. Live for exactly 48 hours: expires_at is generated, created_at never changes, nothing edits a post.';

create index posts_feed_idx    on public.posts (created_at desc, id desc) where status = 'visible';
create index posts_author_idx  on public.posts (author_id, created_at desc);
create index posts_topic_idx   on public.posts (topic_id, created_at desc) where status = 'visible' and topic_id is not null;
create index posts_expires_idx on public.posts (expires_at);
create index posts_review_idx  on public.posts (created_at) where report_count > 0 or status <> 'visible';

-- Nothing about a post but its counters and status may change.
create or replace function private.posts_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.author_id is distinct from old.author_id or new.kind is distinct from old.kind
     or new.body is distinct from old.body or new.question_id is distinct from old.question_id
     or new.topic_id is distinct from old.topic_id or new.exam_tag is distinct from old.exam_tag
     or new.contains_spoiler is distinct from old.contains_spoiler or new.poll_options is distinct from old.poll_options
     or new.created_at is distinct from old.created_at then
    -- ON DELETE SET NULL of a question / topic / tag is the one allowed exception.
    if pg_trigger_depth() > 1 then
      return new;
    end if;
    raise exception 'posts cannot be edited' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger posts_immutable
  before update on public.posts
  for each row execute function private.posts_immutable();

create table public.post_replies (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 280),
  created_at  timestamptz not null default now(),
  -- A copy of the parent's expiry: replies carry no extra time.
  expires_at  timestamptz not null
);

create index post_replies_thread_idx on public.post_replies (post_id, created_at, id);
create index post_replies_author_idx on public.post_replies (author_id);
create index post_replies_expires_idx on public.post_replies (expires_at);

create or replace function private.post_replies_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select p.expires_at into new.expires_at from public.posts p where p.id = new.post_id;
  elsif new.expires_at is distinct from old.expires_at or new.body is distinct from old.body
        or new.created_at is distinct from old.created_at or new.post_id is distinct from old.post_id then
    raise exception 'replies cannot be edited' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger post_replies_expiry
  before insert or update on public.post_replies
  for each row execute function private.post_replies_expiry();

create table public.post_reactions (
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  reaction    text not null check (reaction in ('up', 'fire', 'idea')),
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index post_reactions_user_idx on public.post_reactions (user_id);

create table public.poll_votes (
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  option_idx  smallint not null check (option_idx between 0 and 3),
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.post_reports (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  reporter_id  uuid references public.profiles (id) on delete set null,
  reason       text not null check (reason in ('spam', 'abuse', 'answer_leak', 'personal_info', 'other')),
  details      text check (char_length(details) <= 300),
  created_at   timestamptz not null default now(),
  unique (post_id, reporter_id)
);

create index post_reports_post_idx on public.post_reports (post_id);

-- What survives a reported or removed post: who wrote it, a hash of what they wrote and why it was
-- reported, so repeat offenders can still be actioned. 30 days, then gone.
create table public.moderation_snapshots (
  id            bigint generated always as identity primary key,
  post_id       uuid not null,
  author_id     uuid not null references public.profiles (id) on delete cascade,
  body_hash     text not null check (body_hash ~ '^[0-9a-f]{64}$'),
  reasons       text[] not null default '{}',
  report_count  integer not null default 0,
  outcome       text not null check (outcome in ('visible', 'hidden', 'removed', 'author_deleted')),
  created_at    timestamptz not null default now(),
  purge_after   timestamptz not null default now() + interval '30 days',
  unique (post_id)
);

create index moderation_snapshots_author_idx on public.moderation_snapshots (author_id, created_at desc);
create index moderation_snapshots_purge_idx on public.moderation_snapshots (purge_after);

create table public.mutes (
  muter_id    uuid not null references public.profiles (id) on delete cascade,
  muted_id    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

-- Phrases (lowercase letters, digits, spaces) a post or reply may not contain. Managed by admins in SQL.
create table public.community_banned_words (
  word        text primary key check (word ~ '^[a-z0-9][a-z0-9 ]{1,38}[a-z0-9]$'),
  created_at  timestamptz not null default now()
);

insert into public.community_banned_words (word) values
  ('whatsapp me'), ('telegram group'), ('paid answers'), ('buy answers'), ('leaked paper'), ('free followers'), ('dm me for answers')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Counters
-- ---------------------------------------------------------------------------
create or replace function private.post_reactions_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_reactions_count
  after insert or delete on public.post_reactions
  for each row execute function private.post_reactions_count();

create or replace function private.post_replies_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set reply_count = reply_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set reply_count = greatest(reply_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_replies_count
  after insert or delete on public.post_replies
  for each row execute function private.post_replies_count();

-- ---------------------------------------------------------------------------
-- Helpers (not reachable from the API)
-- ---------------------------------------------------------------------------
-- Can `viewer` read a post right now? Time first: an expired post is gone for everyone.
create or replace function private.post_readable(viewer uuid, author uuid, st text, exp timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exp > now()
     and case
           when author = viewer then st <> 'removed'
           else st = 'visible'
                and not private.is_blocked_pair(viewer, author)
                and exists (select 1 from public.profiles p where p.id = author and p.banned_at is null)
         end;
$$;

create or replace function private.reply_readable(viewer uuid, parent uuid, author uuid, exp timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exp > now()
     and (author = viewer
          or (not private.is_blocked_pair(viewer, author)
              and exists (select 1 from public.profiles p where p.id = author and p.banned_at is null)))
     and exists (select 1 from public.posts x
                 where x.id = parent and private.post_readable(viewer, x.author_id, x.status, x.expires_at));
$$;

-- A plan limit (plans.limits) or the default, so limits change without a deploy.
create or replace function private.plan_limit(uid uuid, limit_key text, fallback integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(private.entitlements_for(uid) -> 'limits' ->> limit_key, '')::integer, fallback);
$$;

-- Removed posts by this author in the last 30 days (live and already cleaned up).
create or replace function private.author_strikes(uid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.posts p where p.author_id = uid and p.status = 'removed' and p.created_at > now() - interval '30 days')::integer
       + (select count(*) from public.moderation_snapshots s
          where s.author_id = uid and s.outcome = 'removed' and s.created_at > now() - interval '30 days')::integer;
$$;

create or replace function private.is_verified(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.accounts a where a.id = uid and a.email_verified_at is not null);
$$;

-- Plain-text checks shared by posts and replies. Returns a clean body or raises 22023.
create or replace function private.clean_community_text(raw text, max_chars integer, uid uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t text := btrim(regexp_replace(coalesce(raw, ''), '[' || chr(1) || '-' || chr(8) || chr(11) || chr(12) || chr(14) || '-' || chr(31) || chr(127) || ']', '', 'g'));
begin
  if char_length(t) < 1 or char_length(t) > max_chars then
    raise exception 'Write between 1 and % characters.', max_chars using errcode = 'invalid_parameter_value';
  end if;
  -- No raw HTML or images: the app renders text only.
  if t ~* '<\s*/?\s*(script|iframe|img|a|svg|style|object|embed|link|meta|form|input|button|video|audio|base)\y' or t ~ '!\[' then
    raise exception 'Images and HTML are not allowed.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.community_banned_words w
             where lower(t) ~ ('(^|[^[:alnum:]])' || w.word || '([^[:alnum:]]|$)')) then
    raise exception 'That contains words we do not allow here.' using errcode = 'invalid_parameter_value';
  end if;
  if t ~* '(https?://|www\.|(^|[^[:alnum:]])t\.me/|(^|[^[:alnum:]])wa\.me/|[a-z0-9-]{2,}\.(com|org|net|io|app|dev|xyz|info|link|gl)(/|[^[:alnum:]]|$))'
     and not private.is_verified(uid) then
    raise exception 'Links are only allowed for players with a verified email.' using errcode = 'invalid_parameter_value';
  end if;
  return t;
end;
$$;

-- Does this text look like it gives away the answer of the question? Cues ("the answer is", option
-- letters) and the text of the correct option itself (when it is long enough not to match by chance).
create or replace function private.looks_like_answer_leak(txt text, qid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  correct text;
begin
  if txt ~* '(^|[^[:alnum:]])(the\s+)?(correct\s+)?(answer|ans)\s*(is|are|:|=|->|-)'
     or txt ~* '(^|[^[:alnum:]])(option|choice|opt)\s*\(?[a-e]\)?([^[:alnum:]]|$)'
     or txt ~* '(^|\s)\([a-e]\)(\s|$|[.,!])' then
    return true;
  end if;
  select o.body into correct
  from public.question_answers a
  join public.question_options o on o.id = a.correct_option_id and o.question_id = a.question_id
  where a.question_id = qid;
  if correct is not null and char_length(btrim(correct)) between 3 and 60
     and lower(txt) ~ ('(^|[^[:alnum:]])' || regexp_replace(lower(btrim(correct)), '([][\\.()*+?{}|^$])', '\\\1', 'g') || '([^[:alnum:]]|$)') then
    return true;
  end if;
  return false;
end;
$$;

-- Is the question in a contest that is running now? Posts about it are blocked until it ends.
create or replace function private.question_in_live_contest(qid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.contest_items i join public.contests c on c.id = i.contest_id
                 where i.question_id = qid and c.is_published and now() >= c.starts_at and now() < c.ends_at);
$$;

-- Keeps what a moderator needs from a post that is about to be deleted.
create or replace function private.snapshot_post(p public.posts, outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Nothing to keep for a post nobody reported and nobody moderated.
  if p.report_count = 0 and p.status = 'visible' then
    return;
  end if;
  insert into public.moderation_snapshots (post_id, author_id, body_hash, reasons, report_count, outcome)
  select p.id, p.author_id, encode(sha256(convert_to(p.body, 'UTF8')), 'hex'),
         coalesce((select array_agg(distinct r.reason order by r.reason) from public.post_reports r where r.post_id = p.id), '{}'),
         p.report_count,
         case when p.status = 'removed' then 'removed' when outcome = 'author_deleted' then 'author_deleted' else p.status end
  on conflict (post_id) do nothing;
end;
$$;

-- The post as one player sees it. A spoiler about a question stays hidden from anyone who has not
-- attempted that question; the linked question shows its stem only, never options or the answer.
create or replace function private.post_card(p public.posts, viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mine     boolean := p.author_id = viewer;
  attempted boolean := false;
  locked   boolean;
  q        jsonb;
  poll     jsonb;
begin
  if p.question_id is not null then
    attempted := exists (select 1 from public.attempts a where a.user_id = viewer and a.question_id = p.question_id);
    select jsonb_build_object('id', x.id, 'stem', left(x.stem, 240), 'difficulty', x.difficulty,
                              'subtopic_id', x.subtopic_id, 'attempted', attempted)
    into q
    from public.questions x where x.id = p.question_id and x.status = 'published';
  end if;
  locked := p.contains_spoiler and p.question_id is not null and not mine and not attempted;

  if p.poll_options is not null then
    poll := jsonb_build_object(
      'options', (select jsonb_agg(jsonb_build_object('text', o.t, 'votes',
                    (select count(*) from public.poll_votes v where v.post_id = p.id and v.option_idx = o.i - 1)) order by o.i)
                  from unnest(p.poll_options) with ordinality as o(t, i)),
      'my_vote', (select v.option_idx from public.poll_votes v where v.post_id = p.id and v.user_id = viewer));
  end if;

  return jsonb_build_object(
    'id',               p.id,
    'kind',             p.kind,
    'body',             case when locked then null else p.body end,
    'spoiler',          p.contains_spoiler,
    'spoiler_locked',   locked,
    'question',         q,
    'topic',            (select jsonb_build_object('id', t.id, 'name', t.name) from public.topics t where t.id = p.topic_id),
    'exam_tag',         p.exam_tag,
    'poll',             poll,
    'created_at',       p.created_at,
    'expires_at',       p.expires_at,
    'like_count',       p.like_count,
    'reply_count',      p.reply_count,
    'my_reaction',      (select r.reaction from public.post_reactions r where r.post_id = p.id and r.user_id = viewer),
    'is_mine',          mine,
    'status',           case when mine then p.status end,
    'author_verified',  private.is_verified(p.author_id),
    'author',           private.user_card(viewer, p.author_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Writing: posts
-- ---------------------------------------------------------------------------
create or replace function public.create_post(
  kind              text,
  body              text,
  question_id       uuid default null,
  topic_id          uuid default null,
  exam_tag          text default null,
  contains_spoiler  boolean default false,
  poll_options      text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.require_uid();
  text_   text;
  opts    text[];
  o       text;
  strikes integer;
  daily   integer;
  p       public.posts;
  spoiler boolean := coalesce(create_post.contains_spoiler, false);
begin
  if create_post.kind is null or create_post.kind not in ('question', 'tip', 'win', 'study_buddy', 'poll') then
    raise exception 'Choose what kind of post this is.' using errcode = 'invalid_parameter_value';
  end if;

  -- New accounts and players who have not finished a daily set can reply, not post.
  if not exists (select 1 from public.profiles x where x.id = uid and x.created_at <= now() - interval '24 hours') then
    raise exception 'You can post 24 hours after joining. You can reply in the meantime.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not exists (select 1 from public.xp_events e where e.user_id = uid and e.reason = 'daily_complete') then
    raise exception 'Finish a daily set to unlock posting. You can reply in the meantime.' using errcode = 'object_not_in_prerequisite_state';
  end if;

  text_ := private.clean_community_text(create_post.body, 500, uid);

  if create_post.kind = 'poll' then
    opts := array(select btrim(x) from unnest(create_post.poll_options) x);
    if cardinality(opts) is null or cardinality(opts) not between 2 and 4 then
      raise exception 'A poll needs 2 to 4 options.' using errcode = 'invalid_parameter_value';
    end if;
    foreach o in array opts loop
      if char_length(o) not between 1 and 40 then
        raise exception 'Poll options are 1 to 40 characters.' using errcode = 'invalid_parameter_value';
      end if;
      perform private.clean_community_text(o, 40, uid);
    end loop;
  elsif create_post.poll_options is not null then
    raise exception 'Only polls have options.' using errcode = 'invalid_parameter_value';
  end if;

  if create_post.kind = 'study_buddy' and create_post.exam_tag is null then
    raise exception 'Choose the exam you want a study buddy for.' using errcode = 'invalid_parameter_value';
  end if;
  if create_post.exam_tag is not null and not exists (select 1 from public.tags t where t.slug = create_post.exam_tag and t.kind = 'exam') then
    raise exception 'Unknown exam.' using errcode = 'invalid_parameter_value';
  end if;
  if create_post.topic_id is not null and not exists (select 1 from public.topics t where t.id = create_post.topic_id and t.is_active) then
    raise exception 'Unknown topic.' using errcode = 'invalid_parameter_value';
  end if;

  if create_post.question_id is not null then
    if not exists (select 1 from public.questions q where q.id = create_post.question_id and q.status = 'published') then
      raise exception 'That question is not available.' using errcode = 'no_data_found';
    end if;
    if private.question_in_live_contest(create_post.question_id) then
      raise exception 'That question is part of a contest that is running. Posts about it open when it ends.'
        using errcode = 'object_not_in_prerequisite_state';
    end if;
    if not spoiler and private.looks_like_answer_leak(text_, create_post.question_id) then
      raise exception 'This looks like it gives away the answer. Tick "Contains spoiler" to post it.' using errcode = 'SP422';
    end if;
  end if;

  strikes := private.author_strikes(uid);
  daily := greatest(private.plan_limit(uid, 'posts_per_day', 5) / case when strikes >= 2 then 2 else 1 end, 1);
  perform private.social_limit('post_d', 86400, daily);

  insert into public.posts (author_id, kind, body, question_id, topic_id, exam_tag, contains_spoiler, poll_options, status)
  values (uid, create_post.kind, text_, create_post.question_id, create_post.topic_id, create_post.exam_tag,
          spoiler, case when create_post.kind = 'poll' then opts end,
          -- Shadow limit: after three removals in 30 days new posts wait for review, visible only to the author.
          case when strikes >= 3 then 'hidden' else 'visible' end)
  returning * into p;

  return jsonb_build_object('post', private.post_card(p, uid), 'server_now', now());
end;
$$;

create or replace function public.delete_post(target_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  p   public.posts;
begin
  select * into p from public.posts x where x.id = target_post_id and x.author_id = uid for update;
  if not found then
    raise exception 'post not found' using errcode = 'no_data_found';
  end if;
  perform private.snapshot_post(p, 'author_deleted');
  delete from public.posts x where x.id = p.id;
  return jsonb_build_object('deleted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Writing: replies, reactions, polls
-- ---------------------------------------------------------------------------
create or replace function public.create_reply(target_post_id uuid, body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := private.require_uid();
  p     public.posts;
  t     text;
  r     public.post_replies;
begin
  select * into p from public.posts x where x.id = target_post_id for share;
  if not found or not private.post_readable(uid, p.author_id, p.status, p.expires_at) or p.status <> 'visible' then
    raise exception 'post not found' using errcode = 'no_data_found';
  end if;
  t := private.clean_community_text(create_reply.body, 280, uid);
  if p.question_id is not null and private.looks_like_answer_leak(t, p.question_id) then
    raise exception 'This looks like it gives away the answer. Share a hint instead.' using errcode = 'SP422';
  end if;
  perform private.social_limit('reply_d', 86400, greatest(private.plan_limit(uid, 'replies_per_day', 30)
          / case when private.author_strikes(uid) >= 2 then 2 else 1 end, 1));

  insert into public.post_replies (post_id, author_id, body, expires_at)
  values (p.id, uid, t, p.expires_at)
  returning * into r;

  return jsonb_build_object('id', r.id, 'post_id', r.post_id, 'body', r.body, 'created_at', r.created_at,
                            'expires_at', r.expires_at, 'is_mine', true, 'can_delete', true,
                            'author', private.user_card(uid, uid));
end;
$$;

-- The reply's author, or the author of the post it is on, may delete it.
create or replace function public.delete_reply(target_reply_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
begin
  delete from public.post_replies r
  using public.posts p
  where r.id = target_reply_id and p.id = r.post_id and (r.author_id = uid or p.author_id = uid);
  if not found then
    raise exception 'reply not found' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('deleted', true);
end;
$$;

-- One reaction per player per post: 'up', 'fire', 'idea', or null to take it back.
create or replace function public.react_post(target_post_id uuid, reaction text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  p   public.posts;
begin
  if react_post.reaction is not null and react_post.reaction not in ('up', 'fire', 'idea') then
    raise exception 'unknown reaction' using errcode = 'invalid_parameter_value';
  end if;
  select * into p from public.posts x where x.id = target_post_id;
  if not found or not private.post_readable(uid, p.author_id, p.status, p.expires_at) then
    raise exception 'post not found' using errcode = 'no_data_found';
  end if;
  perform private.social_limit('react_h', 3600, 300);

  if react_post.reaction is null then
    delete from public.post_reactions r where r.post_id = p.id and r.user_id = uid;
  else
    insert into public.post_reactions as r (post_id, user_id, reaction) values (p.id, uid, react_post.reaction)
    on conflict (post_id, user_id) do update set reaction = excluded.reaction;
  end if;
  return jsonb_build_object('like_count', (select x.like_count from public.posts x where x.id = p.id),
                            'my_reaction', react_post.reaction);
end;
$$;

create or replace function public.vote_poll(target_post_id uuid, option_idx integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  p   public.posts;
begin
  select * into p from public.posts x where x.id = target_post_id;
  if not found or p.poll_options is null or not private.post_readable(uid, p.author_id, p.status, p.expires_at) then
    raise exception 'post not found' using errcode = 'no_data_found';
  end if;
  if vote_poll.option_idx is null or vote_poll.option_idx < 0 or vote_poll.option_idx >= cardinality(p.poll_options) then
    raise exception 'unknown option' using errcode = 'invalid_parameter_value';
  end if;
  perform private.social_limit('vote_h', 3600, 120);
  -- A vote is final.
  insert into public.poll_votes (post_id, user_id, option_idx) values (p.id, uid, vote_poll.option_idx) on conflict do nothing;
  return private.post_card(p, uid) -> 'poll';
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports, mutes
-- ---------------------------------------------------------------------------
create or replace function public.report_post(target_post_id uuid, reason text, details text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  p   public.posts;
  n   integer;
  added integer;
begin
  select * into p from public.posts x where x.id = target_post_id for update;
  if not found or p.author_id = uid or not private.post_readable(uid, p.author_id, p.status, p.expires_at) then
    raise exception 'post not found' using errcode = 'no_data_found';
  end if;
  perform private.social_limit('report_post_d', 86400, 30);

  insert into public.post_reports (post_id, reporter_id, reason, details)
  values (p.id, uid, report_post.reason, nullif(btrim(report_post.details), ''))
  on conflict (post_id, reporter_id) do nothing;
  get diagnostics added = row_count;

  if added > 0 then
    select count(*) into n from public.post_reports r where r.post_id = p.id;
    -- Three different people: hidden until a moderator has looked, unless one already did.
    update public.posts x
    set report_count = n,
        status = case when n >= 3 and x.status = 'visible' and x.reviewed_at is null then 'hidden' else x.status end
    where x.id = p.id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mute_user(target_handle text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  tid uuid := private.social_target(uid, target_handle);
begin
  if tid = uid then
    raise exception 'you cannot mute yourself' using errcode = 'invalid_parameter_value';
  end if;
  perform private.social_limit('mute_d', 86400, 100);
  insert into public.mutes (muter_id, muted_id) values (uid, tid) on conflict do nothing;
  return jsonb_build_object('muted', true);
end;
$$;

create or replace function public.unmute_user(target_handle text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  tid uuid;
begin
  select p.id into tid from public.profiles p where p.handle = lower(btrim(coalesce(target_handle, '')));
  if tid is null then
    raise exception 'user not found' using errcode = 'no_data_found';
  end if;
  delete from public.mutes m where m.muter_id = uid and m.muted_id = tid;
  return jsonb_build_object('muted', false);
end;
$$;

create or replace function public.get_mutes()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select private.require_uid() as uid)
  select jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('handle', p.handle, 'avatar_url', p.avatar_url, 'muted_at', m.created_at) order by m.created_at desc)
    from public.mutes m join public.profiles p on p.id = m.muted_id
    where m.muter_id = me.uid), '[]'::jsonb))
  from me;
$$;

-- ---------------------------------------------------------------------------
-- Reading: feeds, one post, replies
-- ---------------------------------------------------------------------------
-- feed: 'following' (people you follow and you), 'topic' (needs topic_id), 'everyone', 'mine'
-- or 'group' (college / batch leagues: empty until those exist). sort: 'new' or 'hot'.
-- Hot is (likes + 2 * replies) / (age in hours + 2) ^ 1.5, fixed at the time of the first page so
-- paging stays stable. 20 per page; the cursor is opaque.
create or replace function public.get_feed(
  feed      text default 'everyone',
  sort      text default 'new',
  topic_id  uuid default null,
  cursor    text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.require_uid();
  as_of   timestamptz := now();
  cur_ts  timestamptz;
  cur_id  uuid;
  cur_sc  double precision;
  parts   text[];
  result  jsonb;
begin
  if feed not in ('following', 'topic', 'everyone', 'mine', 'group') then
    raise exception 'unknown feed' using errcode = 'invalid_parameter_value';
  end if;
  if sort not in ('new', 'hot') then
    raise exception 'unknown sort' using errcode = 'invalid_parameter_value';
  end if;
  if feed = 'topic' and get_feed.topic_id is null then
    raise exception 'choose a topic' using errcode = 'invalid_parameter_value';
  end if;
  if feed = 'group' then
    return jsonb_build_object('items', '[]'::jsonb, 'next_cursor', null, 'server_now', now());
  end if;

  if cursor is not null then
    begin
      parts := string_to_array(cursor, '|');
      if sort = 'new' then
        cur_ts := parts[1]::timestamptz; cur_id := parts[2]::uuid;
      else
        as_of := parts[1]::timestamptz; cur_sc := parts[2]::double precision; cur_id := parts[3]::uuid;
      end if;
    exception when others then
      raise exception 'invalid cursor' using errcode = 'invalid_parameter_value';
    end;
  end if;

  result := (
    with hidden as (
      select b.blocked_id as id from public.blocks b where b.blocker_id = uid
      union select b.blocker_id from public.blocks b where b.blocked_id = uid
      union select m.muted_id from public.mutes m where m.muter_id = uid
    ), base as (
      select p.*,
             (p.like_count + 2 * p.reply_count)::double precision
               / power(greatest(extract(epoch from (as_of - p.created_at)) / 3600.0, 0) + 2, 1.5) as hot_score
      from public.posts p
      join public.profiles a on a.id = p.author_id and a.banned_at is null
      where p.expires_at > now()
        and p.created_at <= as_of
        and (p.status = 'visible' or (p.author_id = uid and p.status = 'hidden'))
        and (p.author_id = uid or p.author_id not in (select h.id from hidden h))
        and case feed
              when 'following' then p.author_id = uid or p.author_id in (select f.followee_id from public.follows f where f.follower_id = uid)
              when 'topic' then p.topic_id = get_feed.topic_id
              when 'mine' then p.author_id = uid
              else true
            end
    ), page as (
      select b.*, row_number() over (
               order by case when sort = 'hot' then b.hot_score end desc nulls last,
                        case when sort = 'new' then b.created_at end desc nulls last, b.id desc) as rn
      from base b
      where case
              when cursor is null then true
              when sort = 'new' then (b.created_at, b.id) < (cur_ts, cur_id)
              else (b.hot_score, b.id) < (cur_sc, cur_id)
            end
      order by case when sort = 'hot' then b.hot_score end desc nulls last,
               case when sort = 'new' then b.created_at end desc nulls last, b.id desc
      limit 21
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg((select private.post_card(px, uid) from public.posts px where px.id = g.id) order by g.rn)
                         from page g where g.rn <= 20), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > 20 then (
        select case when sort = 'new' then g.created_at::text || '|' || g.id
                    else as_of::text || '|' || g.hot_score::text || '|' || g.id end
        from page g where g.rn = 20) end,
      'server_now', now())
  );
  return result;
end;
$$;

create or replace function public.get_post(target_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  p   public.posts;
begin
  select * into p from public.posts x where x.id = target_post_id;
  if not found or not private.post_readable(uid, p.author_id, p.status, p.expires_at) then
    raise exception 'post not found' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('post', private.post_card(p, uid), 'server_now', now());
end;
$$;

create or replace function public.get_replies(target_post_id uuid, cursor text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid     uuid := private.require_uid();
  p       public.posts;
  cur_ts  timestamptz := private.cursor_ts(cursor);
  cur_key text := private.cursor_key(cursor);
begin
  select * into p from public.posts x where x.id = target_post_id;
  if not found or not private.post_readable(uid, p.author_id, p.status, p.expires_at) then
    raise exception 'post not found' using errcode = 'no_data_found';
  end if;
  return (
    with page as (
      select r.*, row_number() over (order by r.created_at, r.id) as rn
      from (
        select x.* from public.post_replies x
        join public.profiles a on a.id = x.author_id and a.banned_at is null
        where x.post_id = p.id and x.expires_at > now()
          and (x.author_id = uid or (not private.is_blocked_pair(uid, x.author_id)
                                     and not exists (select 1 from public.mutes m where m.muter_id = uid and m.muted_id = x.author_id)))
          and (cur_ts is null or (x.created_at, x.id) > (cur_ts, cur_key::uuid))
        order by x.created_at, x.id
        limit 31
      ) r
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', g.id, 'post_id', g.post_id, 'body', g.body, 'created_at', g.created_at, 'expires_at', g.expires_at,
                 'is_mine', g.author_id = uid, 'can_delete', g.author_id = uid or p.author_id = uid,
                 'author', private.user_card(uid, g.author_id)) order by g.rn) from page g where g.rn <= 30), '[]'::jsonb),
      'next_cursor', case when (select count(*) from page) > 30
                          then (select g.created_at::text || '|' || g.id from page g where g.rn = 30) end,
      'server_now', now())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation (admins). Each action writes audit_log.
-- ---------------------------------------------------------------------------
-- Posts that are live and reported (or hidden / removed). only_status: 'pending' (not reviewed yet) or 'all'.
create or replace function public.admin_list_post_reports(only_status text default 'pending', page_size integer default 20, page_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n_limit  integer := least(greatest(coalesce(page_size, 20), 1), 50);
  n_offset integer := greatest(coalesce(page_offset, 0), 0);
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  return (
    with q as (
      select p.* from public.posts p
      where p.expires_at > now()
        and (p.report_count > 0 or p.status <> 'visible')
        and (only_status = 'all' or p.reviewed_at is null)
    )
    select jsonb_build_object(
      'total', (select count(*) from q),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', x.id, 'kind', x.kind, 'body', x.body, 'status', x.status, 'report_count', x.report_count,
          'created_at', x.created_at, 'expires_at', x.expires_at, 'reviewed_at', x.reviewed_at, 'question_id', x.question_id,
          'author', jsonb_build_object('id', x.author_id, 'handle', a.handle, 'strikes_30d', private.author_strikes(x.author_id)),
          'reports', coalesce((select jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.c))
                               from (select reason, count(*) as c from public.post_reports where post_id = x.id group by reason) r), '[]'::jsonb))
          order by (x.reviewed_at is null) desc, x.report_count desc, x.created_at)
        from (select * from q order by (reviewed_at is null) desc, report_count desc, created_at limit n_limit offset n_offset) x
        join public.profiles a on a.id = x.author_id), '[]'::jsonb))
  );
end;
$$;

-- action: 'hide' | 'restore' | 'remove' | 'dismiss' (reports reviewed, post stays as it is).
create or replace function public.admin_moderate_post(target_post_id uuid, action text, note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_uid();
  p   public.posts;
  new_status text;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if admin_moderate_post.action not in ('hide', 'restore', 'remove', 'dismiss') then
    raise exception 'unknown action' using errcode = 'invalid_parameter_value';
  end if;
  select * into p from public.posts x where x.id = target_post_id for update;
  if not found or p.expires_at <= now() then
    raise exception 'post not found' using errcode = 'no_data_found';
  end if;

  new_status := case admin_moderate_post.action
    when 'hide' then 'hidden' when 'restore' then 'visible' when 'remove' then 'removed' else p.status end;
  update public.posts x set status = new_status, reviewed_at = now() where x.id = p.id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (uid, 'post_' || admin_moderate_post.action, 'post', p.id::text,
          jsonb_build_object('status', p.status, 'report_count', p.report_count, 'author_id', p.author_id,
                             'body_hash', encode(sha256(convert_to(p.body, 'UTF8')), 'hex')),
          jsonb_build_object('status', new_status, 'note', left(nullif(btrim(admin_moderate_post.note), ''), 500)));
  return jsonb_build_object('status', new_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cleanup: hard-deletes expired posts, replies, reactions, votes and reports in batches. Idempotent;
-- rows another run holds are skipped. Reported or removed posts leave a snapshot first.
-- ---------------------------------------------------------------------------
create or replace function private.cleanup_expired_posts(batch_size integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_batch   integer := least(greatest(coalesce(batch_size, 500), 1), 5000);
  p         public.posts;
  n_posts   integer := 0;
  n_replies integer;
  n_purged  integer;
begin
  for p in
    select x.* from public.posts x where x.expires_at <= now() order by x.expires_at limit n_batch for update skip locked
  loop
    perform private.snapshot_post(p, p.status);
    delete from public.posts x where x.id = p.id;
    n_posts := n_posts + 1;
  end loop;

  -- Replies whose parent is already gone went with it; this catches any left over.
  with gone as (
    select r.id from public.post_replies r where r.expires_at <= now() order by r.expires_at limit n_batch for update skip locked
  )
  delete from public.post_replies r using gone where r.id = gone.id;
  get diagnostics n_replies = row_count;

  delete from public.moderation_snapshots s where s.purge_after <= now();
  get diagnostics n_purged = row_count;

  return jsonb_build_object('posts', n_posts, 'replies', n_replies, 'snapshots_purged', n_purged,
                            'more', n_posts >= n_batch or n_replies >= n_batch);
end;
$$;

-- What pg_cron runs: batches until nothing is left (at most 20, so one run is bounded).
create or replace function private.cleanup_expired_posts_all()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r     jsonb;
  total jsonb := jsonb_build_object('posts', 0, 'replies', 0, 'snapshots_purged', 0);
  i     integer := 0;
begin
  loop
    r := private.cleanup_expired_posts(500);
    total := jsonb_build_object('posts', (total ->> 'posts')::int + (r ->> 'posts')::int,
                                'replies', (total ->> 'replies')::int + (r ->> 'replies')::int,
                                'snapshots_purged', (total ->> 'snapshots_purged')::int + (r ->> 'snapshots_purged')::int);
    i := i + 1;
    exit when not (r ->> 'more')::boolean or i >= 20;
  end loop;
  return total;
end;
$$;

select cron.schedule('aptric-posts-cleanup', '*/15 * * * *', $$select private.cleanup_expired_posts_all()$$);

-- ---------------------------------------------------------------------------
-- Push: "your post is about to expire" is opt-in (off until the player turns it on)
-- ---------------------------------------------------------------------------
alter table private.push_preferences add column post_expiry boolean not null default false;

-- ---------------------------------------------------------------------------
-- RLS and privileges: reads only, and an expired post is unreadable here too.
-- ---------------------------------------------------------------------------
alter table public.posts                 enable row level security;
alter table public.post_replies          enable row level security;
alter table public.post_reactions        enable row level security;
alter table public.poll_votes            enable row level security;
alter table public.post_reports          enable row level security;
alter table public.moderation_snapshots  enable row level security;
alter table public.mutes                 enable row level security;
alter table public.community_banned_words enable row level security;

revoke all on public.posts, public.post_replies, public.post_reactions, public.poll_votes, public.post_reports,
              public.moderation_snapshots, public.mutes, public.community_banned_words from anon, authenticated;
revoke all on sequence public.moderation_snapshots_id_seq from anon, authenticated;

grant select on public.posts, public.post_replies, public.post_reactions, public.poll_votes, public.post_reports,
                public.moderation_snapshots, public.mutes to authenticated;

create policy "posts: read live, allowed" on public.posts
  for select to authenticated
  using (private.post_readable((select auth.uid()), author_id, status, expires_at));

create policy "post_replies: read live, allowed" on public.post_replies
  for select to authenticated
  using (private.reply_readable((select auth.uid()), post_id, author_id, expires_at));

create policy "post_reactions: read own" on public.post_reactions
  for select to authenticated
  using (user_id = (select auth.uid())
         and exists (select 1 from public.posts p where p.id = post_id and p.expires_at > now()));

create policy "poll_votes: read own" on public.poll_votes
  for select to authenticated
  using (user_id = (select auth.uid())
         and exists (select 1 from public.posts p where p.id = post_id and p.expires_at > now()));

create policy "post_reports: admin read" on public.post_reports
  for select to authenticated
  using ((select private.is_admin()));

create policy "moderation_snapshots: admin read" on public.moderation_snapshots
  for select to authenticated
  using ((select private.is_admin()) and purge_after > now());

create policy "mutes: read own" on public.mutes
  for select to authenticated
  using (muter_id = (select auth.uid()));

-- community_banned_words: RLS on, no policy: only the definer functions read it.

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  private.post_expires_at(timestamptz), private.posts_immutable(), private.post_replies_expiry(),
  private.post_reactions_count(), private.post_replies_count(),
  private.post_readable(uuid, uuid, text, timestamptz), private.reply_readable(uuid, uuid, uuid, timestamptz),
  private.plan_limit(uuid, text, integer), private.author_strikes(uuid), private.is_verified(uuid),
  private.clean_community_text(text, integer, uuid), private.looks_like_answer_leak(text, uuid),
  private.question_in_live_contest(uuid), private.snapshot_post(public.posts, text), private.post_card(public.posts, uuid),
  private.cleanup_expired_posts(integer), private.cleanup_expired_posts_all()
  from public, anon, authenticated;
-- The read policies run as the reader; the generated column calls the expiry function as the writer.
grant execute on function private.post_readable(uuid, uuid, text, timestamptz), private.reply_readable(uuid, uuid, uuid, timestamptz),
  private.is_blocked_pair(uuid, uuid) to authenticated;

revoke execute on function
  public.create_post(text, text, uuid, uuid, text, boolean, text[]), public.delete_post(uuid),
  public.create_reply(uuid, text), public.delete_reply(uuid), public.react_post(uuid, text), public.vote_poll(uuid, integer),
  public.report_post(uuid, text, text), public.mute_user(text), public.unmute_user(text), public.get_mutes(),
  public.get_feed(text, text, uuid, text), public.get_post(uuid), public.get_replies(uuid, text),
  public.admin_list_post_reports(text, integer, integer), public.admin_moderate_post(uuid, text, text)
  from public, anon;
grant execute on function
  public.create_post(text, text, uuid, uuid, text, boolean, text[]), public.delete_post(uuid),
  public.create_reply(uuid, text), public.delete_reply(uuid), public.react_post(uuid, text), public.vote_poll(uuid, integer),
  public.report_post(uuid, text, text), public.mute_user(text), public.unmute_user(text), public.get_mutes(),
  public.get_feed(text, text, uuid, text), public.get_post(uuid), public.get_replies(uuid, text),
  public.admin_list_post_reports(text, integer, integer), public.admin_moderate_post(uuid, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Feature flag: ships dark, like slice 1. Everyone: set features.community_posts to true on the plans.
-- The 'pilot' plan gets it too.
-- ---------------------------------------------------------------------------
update public.plans set features = features || '{"community_posts": true}' where id = 'pilot';

notify pgrst, 'reload schema';
