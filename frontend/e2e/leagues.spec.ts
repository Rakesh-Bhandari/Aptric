import { expect, test, type Page, type Route } from '@playwright/test';
import * as d from './fixtures/data';
import { API_URL, mockApi } from './fixtures/mockApi';

// Private leagues against the mocked API (npm run e2e): hub, join by code, board.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(page: Page, path: string, opts: { communityGroups?: boolean } = { communityGroups: true }) {
  await page.clock.install({ time: d.FIXED_NOW });
  await mockApi(page, opts);
  await page.goto(path);
}

test('hub lists my leagues and opens the board', async ({ page }) => {
  await open(page, '/leagues');
  await page.getByRole('link', { name: /Section B/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Section B' })).toBeVisible();
  const board = page.getByRole('list', { name: /Section B leaderboard/ });
  await expect(board.getByRole('listitem')).toHaveCount(2);
  await expect(board).toContainText('420 XP');
});

test('a wrong code says so without revealing anything', async ({ page }) => {
  await open(page, '/leagues');
  await page.route(`${API_URL}/rpc/join_group`, (route) => json(route, { status: 'not_found' }));
  await page.getByRole('button', { name: /Join with code/ }).first().click();
  await page.getByLabel(/code/i).fill('abcdefghj2');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText("That invite isn't valid", { exact: false })).toBeVisible();
});

test('flag off: the leagues page is not there', async ({ page }) => {
  await open(page, '/leagues', {});
  await expect(page.getByRole('heading', { name: 'Section B' })).toHaveCount(0);
});
