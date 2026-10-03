import type { Page, Route } from '@playwright/test';
import * as d from './data';

export const API_URL = 'http://localhost:5000';

export interface MockOptions {
  /** Signed out shows the landing page and public screens. */
  signedIn?: boolean;
  theme?: 'light' | 'dark';
  /** Sets the in-app "Reduce motion" switch. */
  reduceMotion?: boolean;
  /** Answered questions in today's daily set (0–10). */
  answered?: number;
  /** Every API call but the profile fails with a 500, to check error states. */
  failAll?: boolean;
  /** API calls but the profile never resolve, to check loading states. */
  hang?: boolean;
  /** Fields merged into the signed-in profile (e.g. onboarded_at: null for onboarding). */
  profile?: Record<string, unknown>;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** A canned Aptric Tutor reply as server-sent events. */
function tutorStream(body: Record<string, unknown>) {
  const intent = String(body.intent ?? 'free');
  const text = intent === 'hint'
    ? 'Find the speed in m/s first: $\\frac{120}{6}$. Then think about how to turn m/s into km/h.'
    : '1. Divide the length by the time.\n2. Convert m/s to km/h by multiplying by $\\frac{18}{5}$.\n\nTry the last step yourself!';
  const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  return event('meta', { phase: 'solving', context: body.context, intent, hint_used: true, hint_charged: intent === 'hint', user_message_id: 'tm1' })
    + event('delta', { text })
    + event('done', { message_id: 'tm2', model: 'meta-llama/llama-3.3-70b-instruct:free', phase: 'solving', hint_used: true, blocked: 0 });
}

/** Answers a player or admin API call with fixture data, or null when unknown. */
function respond(method: string, path: string, body: Record<string, unknown>, opts: MockOptions): unknown {
  const url = new URL(path, API_URL);
  const p = url.pathname;
  const q = url.searchParams;

  if (p.startsWith('/rpc/')) {
    switch (p.slice(5)) {
      case 'get_today_set': return d.todaySet(opts.answered ?? 4);
      case 'get_daily_result': return d.dailyResult();
      case 'get_my_league': return d.myLeague();
      case 'get_leaderboard': return d.leaderboard(String(body.board ?? 'weekly'));
      case 'get_player_profile': return d.playerProfile((body.target_handle as string) ?? null);
      case 'get_practice_tree': return d.practiceTree();
      case 'get_practice_questions': return { mode: body.mode ?? 'normal', subtopics: [{ id: 'st000', name: 'Basics' }], questions: Array.from({ length: 10 }, (_, i) => d.questionCard(i)) };
      case 'get_mistakes': return d.mistakes();
      case 'get_activity': return d.activity(Number(body.days ?? 84));
      case 'list_contests': return d.contests();
      case 'get_contest': return d.contest(String(body.contest_id));
      case 'get_contest_standings': return d.standings();
      case 'start_placement': return { test_id: 'pt1', started_at: d.FIXED_NOW.toISOString(), questions: Array.from({ length: 10 }, (_, i) => d.questionCard(i)) };
      case 'submit_answer': case 'give_up': return d.answerResult(String(body.question_id), String(body.option_id ?? ''));
      case 'use_hint': return { context: body.context, hint: 'Convert m/s to km/h by multiplying by 18/5.', charged: true };
      case 'admin_get_question': return d.adminQuestion(String(body.target_question_id));
      case 'admin_list_users': return body.target_user_id ? [d.adminUsers()[1]] : d.adminUsers();
      default: return null;
    }
  }

  if (p === '/tutor/history') return { available: true, messages: [] };
  if (p === '/me/profile') return method === 'PATCH' ? { ...d.profile(opts.profile), ...body } : d.profile(opts.profile);
  if (p === '/me/placement') return { completed_at: d.FIXED_NOW.toISOString(), placed_level: 3, correct: 7, score: 70 };
  if (p === '/catalog/exam-tags') return d.examTags();
  if (p === '/catalog/levels') return d.levels();
  if (/^\/questions\/[^/]+\/subtopic$/.test(p)) return { subtopic_id: 'st000' };
  if (p === '/admin/taxonomy') return d.adminTaxonomy();
  if (p === '/admin/tags') return d.adminTags();
  if (p === '/admin/questions/count') return { count: q.get('status') === 'in_review' ? 12 : 128 };
  if (p === '/admin/questions') return d.adminQuestions();
  if (p === '/admin/reports/open-count') return { count: 3 };
  if (p === '/admin/reports') return d.adminReports();
  if (p === '/admin/jobs/active-count') return { count: 1 };
  if (p === '/admin/jobs') return d.adminJobs();
  if (p === '/admin/audit') return d.adminAudit();
  if (/^\/admin\/users\/[^/]+\/attempts$/.test(p)) return d.adminAttempts();
  return null;
}

/**
 * Stubs the Aptric API for a page and seeds localStorage (session, theme,
 * reduced motion) before the app boots. Unknown endpoints answer 404 and are
 * collected in the returned list so a test can flag them.
 */
export async function mockApi(page: Page, opts: MockOptions = {}) {
  const unknown: string[] = [];
  const signedIn = opts.signedIn ?? true;

  await page.addInitScript(({ signedIn, theme, reduceMotion, me }) => {
    try {
      if (signedIn) {
        localStorage.setItem('aptric.session', JSON.stringify({
          access_token: 'test', refresh_token: 'test', expires_at: 4_102_444_800, user: { id: me, email: 'priya@example.com' },
        }));
      } else {
        localStorage.removeItem('aptric.session');
      }
      if (theme) localStorage.setItem('aptric.theme', theme);
      if (reduceMotion) localStorage.setItem('aptric.motion', 'reduce');
    } catch { /* storage blocked */ }
  }, { signedIn, theme: opts.theme, reduceMotion: opts.reduceMotion, me: d.ME });

  await page.route(`${API_URL}/**`, async (route) => {
    const req = route.request();
    const path = req.url().slice(API_URL.length);
    // The profile always loads so the shell renders; page data hangs or fails.
    const isProfile = path.startsWith('/me/profile');
    if (opts.hang && !isProfile) return; // never fulfilled: loading state
    if (opts.failAll && !isProfile) return json(route, { error: { code: 'XX000', message: 'Server error' } }, 500);
    let body: Record<string, unknown> = {};
    try { body = req.postDataJSON() ?? {}; } catch { /* no body */ }
    if (path === '/tutor/chat') return route.fulfill({ status: 200, contentType: 'text/event-stream', body: tutorStream(body) });
    const res = respond(req.method(), path, body, { ...opts, signedIn });
    if (res === null) {
      unknown.push(`${req.method()} ${path}`);
      return json(route, { error: { code: '404', message: 'Not mocked' } }, 404);
    }
    return json(route, res);
  });

  // Google Fonts may be unreachable in CI; let the system fallback render.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.continue().catch(() => route.abort()));

  return unknown;
}
