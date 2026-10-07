import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import * as push from '@/lib/push';
import Settings from './Settings';

vi.mock('@/lib/api');
vi.mock('@/lib/push');
vi.mock('@/lib/queries', async (orig) => ({
  ...(await orig<typeof import('@/lib/queries')>()),
  useExamTags: () => ({ data: [] }),
  useLevels: () => ({ data: [] }),
  useTopics: () => ({ data: [] }),
  useTopicPreferences: () => ({ data: { preferred_topic_ids: [], excluded_topic_ids: [] } }),
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
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('@/context/ToastContext', () => ({ useToast: () => toast }));

const PREFS = { daily: true, streak: true, contests: true, league: false, social: true, post_expiry: false };
const renderSettings = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Settings /></MemoryRouter></QueryClientProvider>);

describe('Settings notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(push.pushSupported).mockReturnValue(true);
    vi.mocked(api.getPushConfig).mockResolvedValue({ enabled: true, publicKey: 'KEY', preferences: PREFS });
    vi.stubGlobal('Notification', { permission: 'default' });
  });

  it('explains when the browser has no push support', () => {
    vi.mocked(push.pushSupported).mockReturnValue(false);
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeTruthy();
    expect(screen.getByText(/can't show notifications/)).toBeTruthy();
  });

  it('shows only the device switch until this browser is subscribed, then turns it on', async () => {
    vi.mocked(push.currentSubscription).mockResolvedValue(null);
    vi.mocked(push.enablePush).mockResolvedValue('enabled');
    renderSettings();
    const device = await screen.findByRole('switch', { name: 'Notifications on this device' });
    expect(device.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByRole('switch', { name: 'Daily set' })).toBeNull();

    fireEvent.click(device);
    await waitFor(() => expect(push.enablePush).toHaveBeenCalledWith('KEY'));
    expect((await screen.findByRole('switch', { name: 'Daily set' })).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'League results' }).getAttribute('aria-checked')).toBe('false');
  });

  it('keeps the switch off and says so when permission is denied', async () => {
    vi.mocked(push.currentSubscription).mockResolvedValue(null);
    vi.mocked(push.enablePush).mockResolvedValue('denied');
    renderSettings();
    fireEvent.click(await screen.findByRole('switch', { name: 'Notifications on this device' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/blocked/)));
    expect(screen.getByRole('switch', { name: 'Notifications on this device' }).getAttribute('aria-checked')).toBe('false');
  });

  it('saves a kind and rolls it back when saving fails', async () => {
    vi.mocked(push.currentSubscription).mockResolvedValue({ endpoint: 'e' } as PushSubscription);
    vi.mocked(api.savePushPreferences).mockResolvedValueOnce({ ...PREFS, streak: false });
    renderSettings();
    const streak = await screen.findByRole('switch', { name: 'Streak reminders' });
    fireEvent.click(streak);
    await waitFor(() => expect(api.savePushPreferences).toHaveBeenCalledWith({ streak: false }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Streak reminders' }).getAttribute('aria-checked')).toBe('false'));

    vi.mocked(api.savePushPreferences).mockRejectedValueOnce(new Error('nope'));
    fireEvent.click(screen.getByRole('switch', { name: 'Daily set' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole('switch', { name: 'Daily set' }).getAttribute('aria-checked')).toBe('true');
  });
});
