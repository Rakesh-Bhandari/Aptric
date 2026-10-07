import { expect, test, type Page } from '@playwright/test';
import * as d from './fixtures/data';
import { API_URL, mockApi } from './fixtures/mockApi';

// 48-hour posts against the mocked API (npm run e2e). The mock is stateless, so each test layers a small
// stateful handler over it (the last route registered wins) and drives the page clock.

const json = (route: import('@playwright/test').Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(page: Page, path: string, opts: { communityPosts?: boolean; community?: boolean } = { communityPosts: true }) {
  await page.clock.install({ time: d.FIXED_NOW });
  await mockApi(page, opts);
  await page.goto(path);
}

test('a post shows its countdown, turns amber under 6 hours and leaves the list when it hits zero', async ({ page }) => {
  await open(page, '/community');
  const feed = page.getByRole('list', { name: 'Posts' });
  await expect(feed).toContainText('Post a: convert');
  const soon = feed.getByRole('listitem').first().locator('time');
  await expect(soon).toContainText('expires in 5h 12m');
  await expect(soon.locator('.sr-only')).toHaveText('expires in 5 hours 12 minutes');
  await expect(soon).toHaveClass(/bg-warning-soft/);
  const later = feed.getByRole('listitem').nth(1).locator('time');
  await expect(later).toContainText('expires in 30h 00m');
  await expect(later).not.toHaveClass(/bg-warning-soft/);

  // The page clock keeps running, so allow a minute of real time. The card keeps its height as the numbers change (no layout shift).
  const box = await feed.getByRole('listitem').first().boundingBox();
  await page.clock.fastForward('00:30:00');
  await expect(soon).toContainText(/expires in 4h 4[12]m/);
  expect((await feed.getByRole('listitem').first().boundingBox())?.height).toBe(box?.height);

  // Past its expiry the card disappears without a reload.
  await page.clock.fastForward('04:43:00');
  await expect(feed).not.toContainText('Post a: convert');
  await expect(feed).toContainText('Post b: convert');
  await expect(feed.getByRole('listitem').first().locator('time')).toContainText(/expires in 24h 4[67]m/);
});

test('write a post: it appears with 48 hours on the clock', async ({ page }) => {
  const posts: unknown[] = [d.post('b', 30)];
  const created: Record<string, unknown>[] = [];
  await open(page, '/community');
  await page.route(`${API_URL}/rpc/get_feed`, (route) => json(route, d.feedPage(posts)));
  await page.route(`${API_URL}/rpc/create_post`, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    created.push(body);
    const fresh = d.post('new', 48, { body: body.body, kind: body.kind, is_mine: true });
    posts.unshift(fresh);
    return json(route, { post: fresh, server_now: d.FIXED_NOW.toISOString() });
  });
  await page.goto('/community');
  await page.getByRole('button', { name: 'New post' }).click();
  const dialog = page.getByRole('dialog', { name: 'New post' });
  await expect(dialog).toContainText('Visible to everyone for 48 hours');
  await dialog.getByLabel('Your post').fill('Always check units first.');
  await dialog.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Posts' })).toContainText('Always check units first.');
  await expect(page.getByRole('list', { name: 'Posts' }).getByRole('listitem').first().locator('time')).toContainText('expires in 48h 00m');
  expect(created[0]).toMatchObject({ kind: 'tip', body: 'Always check units first.' });
});

test('a post that gives away an answer must be marked as a spoiler', async ({ page }) => {
  await open(page, '/community?compose=1&question=q-1');
  let calls = 0;
  await page.route(`${API_URL}/rpc/create_post`, (route) => {
    calls += 1;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (!body.contains_spoiler) {
      return json(route, { error: { code: 'SP422', message: 'This looks like it gives away the answer. Tick "Contains spoiler" to post it.' } }, 422);
    }
    return json(route, { post: d.post('s', 48, { spoiler: true }), server_now: d.FIXED_NOW.toISOString() });
  });
  const dialog = page.getByRole('dialog', { name: 'New post' });
  await dialog.getByLabel('Your post').fill('The answer is 72, easy.');
  await expect(dialog.getByRole('status')).toContainText('gives away the answer');
  await dialog.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Contains spoiler');
  await expect(dialog.getByLabel('Contains spoiler')).toBeChecked();
  await dialog.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(calls).toBe(2);
});

test('a spoiler is locked until you have attempted the question', async ({ page }) => {
  await open(page, '/community');
  await page.route(`${API_URL}/rpc/get_feed`, (route) => json(route, d.feedPage([
    d.post('lock', 20, { body: null, spoiler: true, spoiler_locked: true, kind: 'win',
      question: { id: 'q1', stem: 'A train 240 m long passes a pole in 12 s. Speed?', difficulty: 'easy', subtopic_id: 'st000', attempted: false } }),
    d.post('open', 21, { body: 'Hidden until tapped: it is 72.', spoiler: true,
      question: { id: 'q1', stem: 'A train 240 m long passes a pole in 12 s. Speed?', difficulty: 'easy', subtopic_id: 'st000', attempted: true } }),
  ])));
  await page.goto('/community');
  await expect(page.getByText('Try the question first to read it.')).toBeVisible();
  await expect(page.getByText('it is 72')).toBeVisible();
  const reveal = page.getByRole('button', { name: /Spoiler\. Tap to reveal/ });
  await expect(reveal).toBeVisible();
  await reveal.click();
  await expect(page.getByRole('button', { name: /Spoiler\. Tap to reveal/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Try it first' })).toBeVisible();
});

test('reactions update at once and roll back when saving fails', async ({ page }) => {
  await open(page, '/community');
  let fail = false;
  await page.route(`${API_URL}/rpc/react_post`, (route) => (fail ? json(route, { error: { code: 'XX000', message: 'boom' } }, 500) : json(route, { like_count: 3, my_reaction: 'up' })));
  const first = page.getByRole('list', { name: 'Posts' }).getByRole('listitem').first();
  await first.getByRole('button', { name: 'Helpful' }).click();
  await expect(first.getByRole('button', { name: 'Helpful' })).toHaveAttribute('aria-pressed', 'true');
  await expect(first.getByLabel('3 reactions')).toBeVisible();
  fail = true;
  await first.getByRole('button', { name: 'Fire' }).click();
  await expect(first.getByRole('button', { name: 'Helpful' })).toHaveAttribute('aria-pressed', 'true');
  await expect(first.getByRole('button', { name: 'Fire' })).toHaveAttribute('aria-pressed', 'false');
});

test('reply to a post', async ({ page }) => {
  await open(page, '/community');
  let sent = '';
  await page.route(`${API_URL}/rpc/create_reply`, (route) => {
    sent = String((route.request().postDataJSON() as Record<string, unknown>).body);
    return json(route, { id: 'r2', post_id: 'a', body: sent, created_at: d.FIXED_NOW.toISOString(), expires_at: d.FIXED_NOW.toISOString(), is_mine: true, can_delete: true, author: d.userCard('priya_s') });
  });
  const first = page.getByRole('list', { name: 'Posts' }).getByRole('listitem').first();
  await first.getByRole('button', { name: '1 reply' }).click();
  await expect(first.getByRole('region', { name: 'Replies' })).toContainText('Thanks, that helped!');
  await first.getByLabel('Write a reply').fill('Same here.');
  await first.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect.poll(() => sent).toBe('Same here.');
});

test('the feature stays dark without the plan switch', async ({ page }) => {
  await open(page, '/community', {});
  await expect(page.getByRole('heading', { name: 'Community is coming soon' })).toBeVisible();
});

test('moderators review reported posts', async ({ page }) => {
  await open(page, '/admin/posts');
  let action = '';
  let removed = false;
  await page.route(`${API_URL}/rpc/admin_list_post_reports`, (route) => json(route, removed ? { total: 0, items: [] } : d.adminPostReports()));
  await page.route(`${API_URL}/rpc/admin_moderate_post`, (route) => {
    action = String((route.request().postDataJSON() as Record<string, unknown>).action);
    removed = true;
    return json(route, { status: 'removed' });
  });
  await page.goto('/admin/posts');
  await expect(page.getByText('Totally legit tip')).toBeVisible();
  await expect(page.getByText('2 removals in 30 days')).toBeVisible();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Nothing to review.')).toBeVisible();
  expect(action).toBe('remove');
});
