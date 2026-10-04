import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import Settings from './Settings';

vi.mock('@/lib/api');
vi.mock('@/lib/queries', async (orig) => ({
  ...(await orig<typeof import('@/lib/queries')>()),
  useExamTags: () => ({ data: [] }),
  useLevels: () => ({ data: [] }),
  useTopics: () => ({
    data: [
      { id: 't1', name: 'Arithmetic', section_id: 's1', section: 'Quantitative Aptitude', questions: 5 },
      { id: 't2', name: 'DBMS', section_id: 's2', section: 'Technical Aptitude', questions: 5 },
      { id: 't3', name: 'OOP', section_id: 's2', section: 'Technical Aptitude', questions: 5 },
    ],
  }),
  useTopicPreferences: () => ({ data: { preferred_topic_ids: ['t1'], excluded_topic_ids: [] } }),
}));
vi.mock('@/context/SessionContext', () => ({
  useSession: () => ({ signOut: vi.fn(), setProfile: vi.fn() }),
  useProfile: () => ({ id: 'u1', handle: 'aarav', display_name: 'Aarav', bio: null, exam_goal: null, daily_target: 10, timezone: 'UTC', placement_level: null }),
}));
vi.mock('@/context/PreferencesContext', () => ({
  usePreferences: () => ({
    theme: 'system', setTheme: vi.fn(), motion: 'system', setMotion: vi.fn(),
    detectTabSwitchesInPractice: true, setDetectTabSwitchesInPractice: vi.fn(),
  }),
}));
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

describe('Settings page', () => {
  it('has the settings sections under one page heading', () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Settings /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    for (const t of ['Profile', 'Goals and level', 'Daily topics', 'Appearance', 'Exam conditions', 'Help and account']) {
      expect(screen.getByRole('heading', { name: t })).toBeTruthy();
    }
    expect(screen.getByRole('switch', { name: /Detect tab switches in Practice/ })).toBeTruthy();
  });

  it('saves the topics you prefer and skip', async () => {
    vi.mocked(api.saveTopicPreferences).mockResolvedValue({ preferred_topic_ids: ['t1'], excluded_topic_ids: ['t2', 't3'] });
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Settings /></MemoryRouter></QueryClientProvider>);
    const save = screen.getByRole('button', { name: 'Save topics' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect((screen.getByRole('radio', { name: /^More/, checked: true }) as HTMLInputElement).name).toBe('topic-t1');
    fireEvent.click(screen.getByRole('button', { name: 'Skip Technical Aptitude' }));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(api.saveTopicPreferences).toHaveBeenCalledWith({ preferred_topic_ids: ['t1'], excluded_topic_ids: ['t2', 't3'] }));
  });
});
