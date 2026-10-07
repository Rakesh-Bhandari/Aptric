// The notifications that are due, found and claimed in one statement each.
//
// Every query selects who should get what ("due"), inserts a private.push_log
// row per (user, dedupe_key) with ON CONFLICT DO NOTHING, and returns the
// subscriptions of only the rows it newly claimed. So a repeated or
// overlapping cron run sends nothing twice. The cron runs hourly, so each
// local-time window below is one hour wide and every timezone (including
// :30 and :45 offsets) falls in exactly one run.

import { query } from '../db.js';
import { messageFor } from './messages.js';
import { send } from './sender.js';

export const DAILY_HOUR = 8;
export const STREAK_HOUR = 20;

// Players who may be notified: not banned, onboarded, with a subscription.
const ELIGIBLE = `p.banned_at is null and p.onboarded_at is not null
  and exists (select 1 from private.push_subscriptions s where s.user_id = p.id)`;
const WANTS = (pref) => `coalesce((select pp.${pref} from private.push_preferences pp where pp.user_id = p.id), true)`;
const LOCAL_DATE = `(now() at time zone p.timezone)::date`;
const LOCAL_HOUR = `extract(hour from now() at time zone p.timezone)`;

/** `due` yields (user_id, dedupe_key, data jsonb). Returns one row per claimed user and subscription. */
const claim = (due) => `
  with due as (${due}),
  claimed as (
    insert into private.push_log (user_id, dedupe_key)
    select user_id, dedupe_key from due
    on conflict do nothing
    returning user_id, dedupe_key
  )
  select c.user_id, d.data, s.endpoint, s.p256dh, s.auth
  from claimed c
  join due d on d.user_id = c.user_id and d.dedupe_key = c.dedupe_key
  join private.push_subscriptions s on s.user_id = c.user_id`;

export const JOBS = [
  {
    type: 'daily',
    // Morning of each local day, unless they've already earned XP today.
    sql: claim(`
      select p.id as user_id, 'daily:' || ${LOCAL_DATE} as dedupe_key, '{}'::jsonb as data
      from public.profiles p
      where ${ELIGIBLE} and ${WANTS('daily')}
        and ${LOCAL_HOUR} = ${DAILY_HOUR}
        and p.last_streak_date is distinct from ${LOCAL_DATE}`),
  },
  {
    type: 'streak',
    // Evening: a live streak (played yesterday) with nothing yet today.
    sql: claim(`
      select p.id as user_id, 'streak:' || ${LOCAL_DATE} as dedupe_key,
             jsonb_build_object('streak', p.current_streak) as data
      from public.profiles p
      where ${ELIGIBLE} and ${WANTS('streak')}
        and ${LOCAL_HOUR} = ${STREAK_HOUR}
        and p.current_streak > 0 and p.last_streak_date = ${LOCAL_DATE} - 1`),
  },
  {
    type: 'contest_start',
    // Published contests opening within the next hour.
    sql: claim(`
      select p.id as user_id, 'contest-start:' || c.id as dedupe_key,
             jsonb_build_object('title', c.title, 'id', c.id) as data
      from public.contests c
      join public.profiles p on true
      where c.is_published and c.starts_at > now() and c.starts_at <= now() + interval '1 hour'
        and ${ELIGIBLE} and ${WANTS('contests')}`),
  },
  {
    type: 'contest_end',
    // Players who entered a contest that ended in the last 3 hours (slack for a missed run).
    sql: claim(`
      select e.user_id, 'contest-end:' || c.id as dedupe_key,
             jsonb_build_object('title', c.title, 'id', c.id, 'rank', r.rank) as data
      from public.contests c
      join public.contest_entries e on e.contest_id = c.id
      join public.profiles p on p.id = e.user_id
      left join lateral private.contest_ranking(c.id) r on r.user_id = e.user_id
      where c.is_published and c.ends_at <= now() and c.ends_at > now() - interval '3 hours'
        and ${ELIGIBLE} and ${WANTS('contests')}`),
  },
  {
    type: 'league',
    // Members of a league finalized by the weekly rollover in the last 3 hours.
    sql: claim(`
      select m.user_id, 'league:' || l.id as dedupe_key,
             jsonb_build_object('outcome', m.outcome, 'final_rank', m.final_rank, 'tier', t.name) as data
      from public.leagues l
      join public.league_members m on m.league_id = l.id
      join public.profiles p on p.id = m.user_id
      join public.league_tiers t on t.tier = p.league_tier
      where l.finalized_at > now() - interval '3 hours' and m.outcome is not null
        and ${ELIGIBLE} and ${WANTS('league')}`),
  },
  // Follows. The dedupe key names the other person, never a date, so follow / unfollow / follow
  // loops (and follow-back spam) notify once per pair while the log keeps the key (60 days).
  {
    type: 'follow',
    // New followers in the last 3 hours who are still followers. Follows that came from an
    // approved request are the followee's own doing, so they are skipped.
    sql: claim(`
      select f.followee_id as user_id, 'follow:' || f.follower_id as dedupe_key, jsonb_build_object('handle', fp.handle) as data
      from public.follows f
      join public.profiles p  on p.id  = f.followee_id
      join public.profiles fp on fp.id = f.follower_id and fp.banned_at is null
      where f.created_at > now() - interval '3 hours'
        and not exists (select 1 from public.follow_requests r
                        where r.follower_id = f.follower_id and r.followee_id = f.followee_id and r.status = 'accepted')
        and not exists (select 1 from public.blocks b
                        where (b.blocker_id = p.id and b.blocked_id = fp.id) or (b.blocker_id = fp.id and b.blocked_id = p.id))
        and ${ELIGIBLE} and ${WANTS('social')}`),
  },
  {
    type: 'follow_request',
    sql: claim(`
      select r.followee_id as user_id, 'follow-request:' || r.follower_id as dedupe_key, jsonb_build_object('handle', fp.handle) as data
      from public.follow_requests r
      join public.profiles p  on p.id  = r.followee_id
      join public.profiles fp on fp.id = r.follower_id and fp.banned_at is null
      where r.status = 'pending' and r.created_at > now() - interval '3 hours'
        and not exists (select 1 from public.blocks b
                        where (b.blocker_id = p.id and b.blocked_id = fp.id) or (b.blocker_id = fp.id and b.blocked_id = p.id))
        and ${ELIGIBLE} and ${WANTS('social')}`),
  },
  {
    type: 'follow_accepted',
    // The requester hears about an accepted request, if the follow is still there.
    sql: claim(`
      select r.follower_id as user_id, 'follow-accepted:' || r.followee_id as dedupe_key, jsonb_build_object('handle', tp.handle) as data
      from public.follow_requests r
      join public.profiles p  on p.id  = r.follower_id
      join public.profiles tp on tp.id = r.followee_id and tp.banned_at is null
      where r.status = 'accepted' and r.responded_at > now() - interval '3 hours'
        and exists (select 1 from public.follows f where f.follower_id = r.follower_id and f.followee_id = r.followee_id)
        and ${ELIGIBLE} and ${WANTS('social')}`),
  },
  {
    type: 'post_expiry',
    // Opt-in only (no preference row means off). Live posts that expire in 5 to 6 hours: the hourly run
    // reaches each post once, and the key makes a repeated run harmless.
    sql: claim(`
      select x.author_id as user_id, 'post-expiry:' || x.id as dedupe_key, jsonb_build_object('id', x.id) as data
      from public.posts x
      join public.profiles p on p.id = x.author_id
      where x.status = 'visible' and x.expires_at > now() + interval '5 hours' and x.expires_at <= now() + interval '6 hours'
        and ${ELIGIBLE}
        and coalesce((select pp.post_expiry from private.push_preferences pp where pp.user_id = p.id), false)`),
  },
  // Challenges. Quiet hours: nothing between 22:00 and 07:00 local time (unclaimed rows wait for the next run).
  {
    type: 'challenge_received',
    sql: claim(`
      select c.opponent_id as user_id, 'challenge:' || c.id as dedupe_key,
             jsonb_build_object('id', c.id, 'handle', fp.handle, 'score', c.challenger_score, 'total', cardinality(c.question_ids)) as data
      from public.challenges c
      join public.profiles p  on p.id  = c.opponent_id
      join public.profiles fp on fp.id = c.challenger_id and fp.banned_at is null
      where c.status = 'pending' and c.sent_at > now() - interval '24 hours' and c.accept_by > now()
        and not exists (select 1 from public.blocks b
                        where (b.blocker_id = p.id and b.blocked_id = fp.id) or (b.blocker_id = fp.id and b.blocked_id = p.id))
        and ${LOCAL_HOUR} between 7 and 21
        and ${ELIGIBLE} and ${WANTS('challenges')}`),
  },
  {
    type: 'challenge_expiring',
    // Waiting for you (or in play) with 5 to 6 hours left.
    sql: claim(`
      select p.id as user_id, 'challenge-expiring:' || c.id as dedupe_key,
             jsonb_build_object('id', c.id, 'handle', fp.handle) as data
      from public.challenges c
      join public.profiles p  on p.id  = c.opponent_id
      join public.profiles fp on fp.id = c.challenger_id and fp.banned_at is null
      where ((c.status = 'pending' and c.sent_at is not null and c.accept_by > now() + interval '5 hours' and c.accept_by <= now() + interval '6 hours')
          or (c.status = 'accepted' and c.complete_by > now() + interval '5 hours' and c.complete_by <= now() + interval '6 hours'))
        and ${LOCAL_HOUR} between 7 and 21
        and ${ELIGIBLE} and ${WANTS('challenges')}`),
  },
  {
    type: 'challenge_result',
    // Both players hear how it ended (finished in the last 24 hours, so a night's quiet hours do not lose it).
    sql: claim(`
      select p.id as user_id, 'challenge-result:' || c.id as dedupe_key,
             jsonb_build_object('id', c.id, 'handle', op.handle, 'total', cardinality(c.question_ids),
               'outcome', case when c.is_draw then 'draw' when c.winner_id = p.id then 'won' else 'lost' end,
               'mine',   case when p.id = c.challenger_id then c.challenger_score else c.opponent_score end,
               'theirs', case when p.id = c.challenger_id then c.opponent_score else c.challenger_score end) as data
      from public.challenges c
      join public.profiles p  on p.id in (c.challenger_id, c.opponent_id)
      join public.profiles op on op.id = case when p.id = c.challenger_id then c.opponent_id else c.challenger_id end and op.banned_at is null
      where c.status = 'completed' and c.completed_at > now() - interval '24 hours'
        and not exists (select 1 from public.blocks b
                        where (b.blocker_id = p.id and b.blocked_id = op.id) or (b.blocker_id = op.id and b.blocked_id = p.id))
        and ${LOCAL_HOUR} between 7 and 21
        and ${ELIGIBLE} and ${WANTS('challenges')}`),
  },
  {
    type: 'group_announcement',
    // Members of a live league hear about a new pinned announcement (not its author), quietly overnight.
    sql: claim(`
      select m.user_id, 'group-announcement:' || a.id as dedupe_key,
             jsonb_build_object('id', a.id, 'group', g.name, 'slug', g.slug, 'body', left(a.body, 120)) as data
      from public.group_announcements a
      join public.groups g on g.id = a.group_id and not g.is_archived
      join public.group_members m on m.group_id = g.id and m.status = 'active' and m.user_id is distinct from a.created_by
      join public.profiles p on p.id = m.user_id
      where a.is_pinned and a.created_at > now() - interval '24 hours'
        and ${LOCAL_HOUR} between 7 and 21
        and ${ELIGIBLE} and ${WANTS('groups')}`),
  },
];

const CHUNK = 25;

/**
 * Sends everything due. `run` and `deliver` are injectable for tests.
 * Returns counts per type: { daily: { users, sent, gone, failed }, ... }.
 */
export async function runDueNotifications({ run = query, deliver = send, jobs = JOBS } = {}) {
  const summary = {};
  for (const job of jobs) {
    const counts = { users: 0, sent: 0, gone: 0, failed: 0 };
    summary[job.type] = counts;
    const { rows } = await run(job.sql);
    counts.users = new Set(rows.map((r) => r.user_id)).size;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const results = await Promise.all(rows.slice(i, i + CHUNK).map((r) => {
        const payload = messageFor(job.type, r.data);
        return payload ? deliver(r, payload) : 'failed';
      }));
      for (const result of results) counts[result] += 1;
    }
  }
  // Keep the log small; keys are date- or id-scoped, so old rows never matter again.
  await run(`delete from private.push_log where sent_at < now() - interval '60 days'`);
  return summary;
}
