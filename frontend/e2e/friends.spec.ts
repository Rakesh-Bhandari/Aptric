import { expect, test, type Page } from '@playwright/test';
import * as d from './fixtures/data';
import { openRoute } from './fixtures/app';
import { API_URL } from './fixtures/mockApi';

// Follow / friends against the mocked API (npm run e2e). The mock is stateless, so each test
// layers a small stateful handler over it: the last route registered wins.

type Calls = { rpc: string; body: Record<string, unknown> }[];

/** follow_user / unfollow_user remember who is followed; the feed shows followed people's events. */
async function followState(page: Page, { failFollow = false } = {}) {
  const followed = new Set<string>();
  const calls: Calls = [];
  await page.route(`${API_URL}/rpc/*`, async (route) => {
    const rpc = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    calls.push({ rpc, body });
    if (rpc === 'follow_user') {
      if (failFollow) return json({ error: { code: 'XX000', message: 'boom' } }, 500);
      followed.add(String(body.target_handle));
      return json({ status: 'following' });
    }
    if (rpc === 'unfollow_user') { followed.delete(String(body.target_handle)); return json({ status: 'none' }); }
    if (rpc === 'get_friend_activity') {
      const all = d.friendActivity();
      return json({ ...all, items: followed.size ? all.items : [] });
    }
    if (rpc === 'get_player_profile') {
      const handle = String(body.target_handle ?? '');
      const p = d.playerProfile(handle || null);
      return json({ ...p, handle, relationship: d.relationship({ following: followed.has(handle), followed_by: true }) });
    }
    return route.fallback();
  });
  return { followed, calls };
}

test('follow someone, then see their activity in the feed', async ({ page }) => {
  await openRoute(page, '/friends', { community: true });
  const { followed } = await followState(page);
  await page.goto('/friends');
  await expect(page.getByRole('heading', { name: 'No activity yet' })).toBeVisible();
  // Suggestions from the weekly league offer a first follow.
  await page.getByRole('button', { name: /Follow @kabir_r/ }).click().catch(() => {});

  await page.goto('/u/diya_n');
  const follow = page.getByRole('button', { name: /^Follow back @diya_n/ });
  await expect(follow).toBeVisible();
  await follow.click();
  // diya_n already follows back, so you are friends now.
  await expect(page.getByRole('button', { name: /^Friends @diya_n/ })).toHaveAttribute('aria-pressed', 'true');
  expect(followed.has('diya_n')).toBe(true);

  await page.goto('/friends');
  await expect(page.getByRole('list', { name: 'Friend activity' })).toContainText("finished today's set (9/10)");
  await expect(page.getByRole('list', { name: 'Friend activity' })).toContainText('reached a 7-day streak');
  await expect(page.getByRole('list', { name: 'Friend activity' })).toContainText('reached Gold league');
});

test('a failed follow rolls back and says so', async ({ page }) => {
  await openRoute(page, '/u/diya_n', { community: true });
  await followState(page, { failFollow: true });
  await page.goto('/u/diya_n');
  await page.getByRole('button', { name: /^Follow back @diya_n/ }).click();
  await expect(page.getByRole('button', { name: /^Follow back @diya_n/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText(/couldn't reach|having trouble|couldn't update/i).first()).toBeVisible();
});

test('the Friends filter narrows the leaderboard to people you follow, plus you', async ({ page }) => {
  const calls: Calls = [];
  await openRoute(page, '/compete?tab=leaderboards', { community: true });
  await page.route(`${API_URL}/rpc/get_leaderboard`, (route) => {
    calls.push({ rpc: 'get_leaderboard', body: route.request().postDataJSON() ?? {} });
    return route.fallback();
  });
  await page.goto('/compete?tab=leaderboards');
  const board = page.getByRole('list', { name: 'This week leaderboard', exact: true });
  await expect(board).toBeVisible();
  const everyone = await board.getByRole('listitem').count();
  await page.getByRole('radio', { name: 'Friends' }).click();
  await expect(page.getByRole('radio', { name: 'Friends' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => calls.some((c) => c.body.friends_only === true)).toBe(true);
  await expect.poll(async () => page.getByText('2 players').count()).toBeGreaterThan(0);
  expect(everyone).toBeGreaterThan(2);
});

test('find people by handle prefix', async ({ page }) => {
  await openRoute(page, '/friends', { community: true });
  await page.getByRole('button', { name: 'Find people' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Find people' });
  await expect(dialog.getByText('Type at least 2 characters.')).toBeVisible();
  await dialog.getByLabel('Handle').fill('as');
  await expect(dialog.getByRole('list', { name: 'Search results' })).toContainText('@asha_k');
});

test('the feature stays dark without the plan switch', async ({ page }) => {
  await openRoute(page, '/friends');
  await expect(page.getByRole('heading', { name: 'Friends are coming soon' })).toBeVisible();
  await openRoute(page, '/compete?tab=leaderboards');
  await expect(page.getByRole('radio', { name: 'Friends' })).toHaveCount(0);
});

test('hidden stats and the block / report menu on a profile', async ({ page }) => {
  await openRoute(page, '/u/diya_n', { community: true });
  await page.route(`${API_URL}/rpc/get_player_profile`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ...d.playerProfile('diya_n'), handle: 'diya_n', stats_hidden: true, solved: null, attempts: null, correct: null,
        is_private: true, relationship: d.relationship() }),
    }));
  await page.goto('/u/diya_n');
  await expect(page.getByText('Hidden by this player').first()).toBeVisible();
  await expect(page.getByText('Private account')).toBeVisible();
  await page.getByRole('button', { name: 'More actions for @diya_n' }).click();
  await expect(page.getByRole('menuitem', { name: 'Report @diya_n' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Block @diya_n' })).toBeVisible();
});
