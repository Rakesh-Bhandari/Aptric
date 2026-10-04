import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Settings from './Settings';

vi.mock('@/lib/api');
vi.mock('@/lib/queries', async (orig) => ({
  ...(await orig<typeof import('@/lib/queries')>()),
  useExamTags: () => ({ data: [] }),
  useLevels: () => ({ data: [] }),
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
    for (const t of ['Profile', 'Goals and level', 'Appearance', 'Exam conditions', 'Help and account']) {
      expect(screen.getByRole('heading', { name: t })).toBeTruthy();
    }
    expect(screen.getByRole('switch', { name: /Detect tab switches in Practice/ })).toBeTruthy();
  });
});
