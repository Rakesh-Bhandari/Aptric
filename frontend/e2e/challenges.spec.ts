import { expect, test, type Page, type Route } from '@playwright/test';
import * as d from './fixtures/data';
import { API_URL, mockApi } from './fixtures/mockApi';

// 1v1 challenges against the mocked API (npm run e2e): see the target, accept, play, see the result.

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(page: Page, path: string, opts: { communityChallenges?: boolean } = { communityChallenges: true }) {
  await page.clock.install({ time: d.FIXED_NOW });
  await mockApi(page, opts);
  await page.goto(path);
}

const completed = d.challenge({
  status: 'completed', can_accept: false, completed_at: d.FIXED_NOW.toISOString(),
  my_run: { started_at: d.FIXED_NOW.toISOString(), deadline_at: d.FIXED_NOW.toISOString(), finished_at: d.FIXED_NOW.toISOString(), violation: null, answered: 3 },
  result: { winner: 'challenger', challenger: { score: 3, time_ms: 72_000, hints: 0 }, opponent: { score: 2, time_ms: 90_000, hints: 0 } },
});

test('see the target, accept, play, and read the result', async ({ page }) => {
  await open(page, '/challenges');
  let state: 'pending' | 'done' = 'pending';
  const answers: string[] = [];
  await page.route(`${API_URL}/rpc/get_challenge`, (route) => json(route, state === 'done' ? completed : d.challenge()));
  await page.route(`${API_URL}/rpc/accept_challenge`, (route) => json(route, d.challengeRun()));
  await page.route(`${API_URL}/rpc/submit_challenge_answer`, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    answers.push(String(body.question_id));
    const finished = answers.length === 3;
    if (finished) state = 'done';
    return json(route, { is_correct: true, answered: answers.length, finished, challenge: d.challenge() });
  });

  // The list shows what to beat, never the questions
  const row = page.getByRole('list', { name: 'Incoming challenges' }).getByRole('listitem').first();
  await expect(row).toContainText('@aarav_meht challenged you: beat 3/3');
  await row.getByRole('link').click();

  await expect(page.getByText('Beat this')).toBeVisible();
  await expect(page.getByText('3/3 in 1:12')).toBeVisible();
  await expect(page.getByText('Convert m/s')).toHaveCount(0);

  await page.getByRole('button', { name: 'Accept and start' }).click();
  await page.getByRole('button', { name: 'I understand, start' }).click();

  for (let i = 0; i < 3; i += 1) {
    const options = page.getByRole('group', { name: 'Answer options' }).getByRole('button');
    await options.first().click();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await page.getByRole('button', { name: i === 2 ? 'Finish' : 'Next question' }).click();
  }
  expect(answers).toHaveLength(3);

  await expect(page.getByRole('heading', { name: 'You lost this one' })).toBeVisible();
  await expect(page.getByText('More correct answers wins.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rematch' })).toBeVisible();
});

test('a challenge that is still a draft says to play first', async ({ page }) => {
  await open(page, '/challenges/ch2');
  await page.route(`${API_URL}/rpc/get_challenge`, (route) => json(route, d.challenge({
    id: 'ch2', role: 'challenger', draft: true, target: null, can_accept: false, sent_at: null, accept_by: null, opponent: d.userCard('aarav_meht'), challenger: d.userCard('priya_s'),
  })));
  await page.goto('/challenges/ch2');
  await expect(page.getByRole('heading', { name: 'Play your set first' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
});

test('the share link shows the target to anyone who is signed in', async ({ page }) => {
  await open(page, '/c/abcdefghjkmnpqrs');
  await page.route(`${API_URL}/rpc/get_challenge`, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    return body.token === 'abcdefghjkmnpqrs'
      ? json(route, d.challenge({ role: 'viewer', opponent: null }))
      : json(route, { error: { code: 'P0002', message: 'challenge not found' } }, 404);
  });
  await page.goto('/c/abcdefghjkmnpqrs');
  await expect(page.getByText('@aarav_meht challenged you')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept and start' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Decline' })).toHaveCount(0);
});

test('a missing challenge says so', async ({ page }) => {
  await open(page, '/challenges/nope');
  await page.route(`${API_URL}/rpc/get_challenge`, (route) => json(route, { error: { code: 'P0002', message: 'challenge not found' } }, 404));
  await page.goto('/challenges/nope');
  await expect(page.getByRole('heading', { name: 'Challenge not found' })).toBeVisible();
});

test('the feature stays dark without the plan switch', async ({ page }) => {
  await open(page, '/challenges', {});
  await expect(page.getByRole('heading', { name: 'Challenges are coming soon' })).toBeVisible();
});
