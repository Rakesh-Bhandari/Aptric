import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { queryClient } from '@/lib/queries';
import type { ContestDetail, ContestViolation } from '@/lib/types';
import ContestPage from './ContestPage';

vi.mock('@/lib/api');

const ref = { id: 'r1', name: 'Quant', slug: 'quant' };
const contest = (over: Partial<ContestDetail> = {}): ContestDetail => ({
  id: 'c1', slug: 'cup', title: 'Weekly cup', description: null,
  starts_at: '2026-10-04T10:00:00Z', ends_at: '2099-10-04T11:00:00Z', state: 'live', question_count: 2, participants: 3,
  my_entry: null, finished_at: null, violation: null, joined: true,
  questions: ['q1', 'q2'].map((id, position) => ({
    id, stem: `Stem ${id}`, difficulty: 'easy', est_seconds: 60, section: ref, topic: ref, subtopic: ref, has_hint: false,
    options: ['a', 'b'].map((body, i) => ({ id: `${id}-o${i}`, position: i, body })),
    position, answer: null, correct_option_id: null, explanation: null,
  })),
  ...over,
} as ContestDetail);

const hide = () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
};

const renderPage = () => render(
  <QueryClientProvider client={queryClient}>
    <ToastProvider>
      <MemoryRouter initialEntries={['/compete/contests/c1']}>
        <Routes><Route path="/compete/contests/:id" element={<ContestPage />} /></Routes>
      </MemoryRouter>
    </ToastProvider>
  </QueryClientProvider>,
);

describe('contest auto-submit on leaving the tab', () => {
  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    vi.mocked(api.getContestStandings).mockResolvedValue({ total: 0, entries: [], me: null });
  });
  afterEach(() => vi.resetAllMocks());

  it('warns before the contest starts that switching tabs ends the attempt', async () => {
    vi.mocked(api.getContest).mockResolvedValue(contest());
    renderPage();
    expect(await screen.findByText(/leaving this tab or window ends your attempt/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /start/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Switching tabs ends your attempt');

    // Not started until the player agrees.
    await user.click(screen.getByRole('button', { name: /not yet/i }));
    expect(screen.queryByText('Stem q1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start/i }));
    await user.click(await screen.findByRole('button', { name: /i understand, start/i }));
    expect(await screen.findByText('Stem q1')).toBeInTheDocument();
  });

  it('auto-submits when the tab is hidden, then shows the auto-submitted result', async () => {
    const violated = contest({ finished_at: '2026-10-04T10:05:00Z', violation: 'tab_hidden' as ContestViolation });
    vi.mocked(api.getContest).mockResolvedValueOnce(contest()).mockResolvedValue(violated);
    vi.mocked(api.finishContest).mockResolvedValue(violated);
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /start/i }));
    await user.click(await screen.findByRole('button', { name: /i understand, start/i }));
    await screen.findByText('Stem q1');

    hide();
    await waitFor(() => expect(api.finishContest).toHaveBeenCalledExactlyOnceWith('c1', 'tab_hidden'));
    expect(await screen.findByRole('heading', { name: /auto-submitted because of a tab switch/i })).toBeInTheDocument();
    // The attempt is closed: nothing to continue.
    expect(screen.queryByText('Stem q1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(start|continue)/i })).not.toBeInTheDocument();
    expect(localStorage.getItem('aptric:contest-violation:c1')).toBeNull();
  });

  it('offers a retry when the server cannot be reached, and keeps the question hidden', async () => {
    vi.mocked(api.getContest).mockResolvedValue(contest());
    vi.mocked(api.finishContest).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(contest({ finished_at: 'x', violation: 'tab_hidden' }));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /start/i }));
    await user.click(await screen.findByRole('button', { name: /i understand, start/i }));
    await screen.findByText('Stem q1');

    hide();
    await user.click(await screen.findByRole('button', { name: /try again/i }));
    expect(screen.queryByText('Stem q1')).not.toBeInTheDocument();
    await waitFor(() => expect(api.finishContest).toHaveBeenCalledTimes(2));
  });

  it('sends a violation the page never got to report, so a reload cannot resume the attempt', async () => {
    localStorage.setItem('aptric:contest-violation:c1', 'tab_hidden');
    vi.mocked(api.getContest).mockResolvedValue(contest());
    vi.mocked(api.finishContest).mockResolvedValue(contest({ finished_at: 'x', violation: 'tab_hidden' }));
    renderPage();
    await waitFor(() => expect(api.finishContest).toHaveBeenCalledExactlyOnceWith('c1', 'tab_hidden'));
    await waitFor(() => expect(localStorage.getItem('aptric:contest-violation:c1')).toBeNull());
  });

  it('does not offer a violated attempt for resuming', async () => {
    vi.mocked(api.getContest).mockResolvedValue(contest({ finished_at: '2026-10-04T10:05:00Z', violation: 'window_blur' }));
    renderPage();
    expect(await screen.findByRole('heading', { name: /auto-submitted because of a tab switch/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('another window or app');
    expect(screen.queryByRole('button', { name: /^(start|continue)/i })).not.toBeInTheDocument();
  });
});
