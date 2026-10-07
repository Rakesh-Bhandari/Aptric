import { expect, test, type Page, type Route } from '@playwright/test';
import * as d from './fixtures/data';
import { API_URL, mockApi } from './fixtures/mockApi';

// User-hosted contests against the mocked API (npm run e2e): host -> schedule, and join a hosted contest with a code.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(page: Page, path: string, opts: { communityContests?: boolean; communityGroups?: boolean } = { communityContests: true }) {
  await page.clock.install({ time: d.FIXED_NOW });
  await mockApi(page, opts);
  await page.goto(path);
}

test('host a contest: pick questions, save, schedule', async ({ page }) => {
  await open(page, '/compete/host/new');
  const calls: { save: Record<string, unknown>[]; publish: number } = { save: [], publish: 0 };
  await page.route(`${API_URL}/rpc/host_save_contest`, (route) => { calls.save.push(route.request().postDataJSON() as Record<string, unknown>); return json(route, d.hostContest({ id: 'c-new', title: 'Friday quiz' })); });
  await page.route(`${API_URL}/rpc/host_publish_contest`, (route) => { calls.publish += 1; return json(route, d.hostContest({ id: 'c-new', status: 'scheduled' })); });
  await page.route(`${API_URL}/rpc/host_get_contest`, (route) => json(route, d.hostContest({ id: 'c-new', title: 'Friday quiz', status: 'scheduled', state: 'upcoming' })));

  await expect(page.getByRole('heading', { name: 'New contest' })).toBeVisible();
  await page.getByLabel('Title').fill('Friday quiz');
  await page.getByRole('button', { name: 'Add random questions' }).click();
  const list = page.getByRole('list', { name: 'Questions in this contest' });
  await expect(list.getByRole('listitem')).toHaveCount(5);
  // The host is told about a question they have already seen, and never sees an answer
  await expect(page.getByRole('status').filter({ hasText: 'answered before' })).toBeVisible();
  await expect(page.getByText('You have seen this')).toBeVisible();
  await expect(page.getByText(/correct/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Schedule contest' }).click();
  await page.getByRole('button', { name: 'Schedule it' }).click();
  await expect(page.getByText('Scheduled', { exact: true }).first()).toBeVisible();
  expect(calls.publish).toBe(1);
  expect(calls.save[0]).toMatchObject({ title: 'Friday quiz', visibility: 'unlisted', host_plays: false });
  expect((calls.save[0].question_ids as string[]).length).toBe(5);
});

test('cannot schedule with fewer than five questions', async ({ page }) => {
  await open(page, '/compete/host/new');
  let published = 0;
  await page.route(`${API_URL}/rpc/host_publish_contest`, (route) => { published += 1; return json(route, d.hostContest()); });
  await page.getByLabel('Title').fill('Too small');
  await page.getByRole('button', { name: 'Schedule contest' }).click();
  await expect(page.getByText('Add at least 5 questions.')).toBeVisible();
  expect(published).toBe(0);
});

test('a player below the bar is told what is missing', async ({ page }) => {
  await open(page, '/compete/host');
  await page.route(`${API_URL}/rpc/list_my_hosted_contests`, (route) => json(route, {
    status: { ...d.hostStatus({ ok: false, reasons: ['level', 'age'], level: 2, age_days: 5 }) }, items: [],
  }));
  await page.reload();
  await expect(page.getByText('Reach level 5 (you are level 2).')).toBeVisible();
  await expect(page.getByText('Your account must be 30 days old (it is 5).')).toBeVisible();
  await expect(page.getByRole('link', { name: 'New contest' })).toHaveCount(0);
});

test('joining a hosted contest with an access code', async ({ page }) => {
  await open(page, '/compete/contests/c-code');
  await expect(page.getByRole('heading', { name: 'Friday quiz' })).toBeVisible();
  await expect(page.getByText('Hosted by')).toContainText('@aarav_meht');
  let attempts = 0;
  await page.route(`${API_URL}/rpc/join_contest`, (route) => {
    attempts += 1;
    const code = (route.request().postDataJSON() as { access_code?: string }).access_code;
    return json(route, { ...d.hostedContest({ id: 'c-code' }), entered: code === 'secret1', code: code === 'secret1' ? undefined : 'wrong' });
  });
  const register = page.getByRole('button', { name: 'Register' });
  await expect(register).toBeDisabled();
  await page.getByLabel('Access code').fill('nope1');
  await register.click();
  await expect(page.getByText("That access code isn't right.")).toBeVisible();
  await page.getByLabel('Access code').fill('secret1');
  await register.click();
  await expect(page.getByText("You're registered", { exact: false })).toBeVisible();
  expect(attempts).toBe(2);
});

test('a hosted contest can be reported', async ({ page }) => {
  await open(page, '/compete/contests/c-hosted');
  let reported: Record<string, unknown> | null = null;
  await page.route(`${API_URL}/rpc/report_contest`, (route) => { reported = route.request().postDataJSON() as Record<string, unknown>; return json(route, { reported: true }); });
  await page.getByRole('button', { name: 'Report this contest' }).click();
  await page.getByLabel('What is wrong?').selectOption('cheating');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Thanks. A moderator will look at it.')).toBeVisible();
  expect(reported).toMatchObject({ reason: 'cheating' });
});

test('the host sees counts, never answers', async ({ page }) => {
  await open(page, '/compete/contests/c-hosted');
  await page.route(`${API_URL}/rpc/get_contest`, (route) => json(route, {
    ...d.contest('c-hosted'), is_host: true, state: 'live', starts_at: new Date(d.FIXED_NOW.getTime() - 600_000).toISOString(),
    dashboard: { registrations: 12, started: 9, finished: 4, active_now: 5, capacity: 50 }, questions: null,
  }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'You host this contest' })).toBeVisible();
  const counts = page.getByRole('definition');
  await expect(counts.first()).toContainText('12');
  await expect(page.getByText('Answers and explanations')).toHaveCount(0);
});

test('flag off: the host hub is not there', async ({ page }) => {
  await open(page, '/compete/host', {});
  await expect(page.getByRole('heading', { name: 'Host a contest' })).toHaveCount(0);
  await expect(page.getByText('Hosting is coming soon')).toBeVisible();
});

test('a moderator approves a public contest', async ({ page }) => {
  await page.clock.install({ time: d.FIXED_NOW });
  await mockApi(page, { profile: { role: 'admin' } });
  let action = '';
  await page.route(`${API_URL}/rpc/admin_review_hosted_contest`, (route) => { action = String((route.request().postDataJSON() as { action: string }).action); return json(route, { id: 'hc1', status: 'scheduled', review_state: 'approved', hidden: false }); });
  await page.goto('/admin/hosted');
  await expect(page.getByRole('heading', { name: 'Hosted contests' })).toBeVisible();
  await expect(page.getByText('Open cup')).toBeVisible();
  await page.getByRole('button', { name: 'Reject' }).isDisabled().then((disabled) => expect(disabled).toBe(true));
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect.poll(() => action).toBe('approve');
});
