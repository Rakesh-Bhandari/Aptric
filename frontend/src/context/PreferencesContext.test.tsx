import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateProfile } from '@/lib/api';
import type { Profile } from '@/lib/types';
import { PreferencesProvider, usePreferences } from './PreferencesContext';

const session = vi.hoisted(() => ({ profile: null as Profile | null, setProfile: vi.fn() }));
vi.mock('@/context/SessionContext', () => ({ useSession: () => session }));
vi.mock('@/lib/api', () => ({ updateProfile: vi.fn() }));

const profile = (on: boolean): Profile => ({
  id: 'u1', handle: 'amy', display_name: null, avatar_url: null, bio: null, role: 'user', timezone: 'UTC',
  exam_goal: null, daily_target: 10, onboarded_at: null, placement_level: null, placed_at: null, detect_tab_switches_practice: on,
});
const wrapper = ({ children }: { children: ReactNode }) => <PreferencesProvider>{children}</PreferencesProvider>;

describe('detect tab switches in Practice', () => {
  beforeEach(() => {
    session.profile = null;
    session.setProfile.mockReset();
    vi.mocked(updateProfile).mockReset();
  });

  it('defaults to on, before the profile loads and for new profiles', () => {
    expect(renderHook(() => usePreferences(), { wrapper }).result.current.detectTabSwitchesInPractice).toBe(true);
    session.profile = profile(true);
    expect(renderHook(() => usePreferences(), { wrapper }).result.current.detectTabSwitchesInPractice).toBe(true);
  });

  it('reads the stored value from the profile', () => {
    session.profile = profile(false);
    expect(renderHook(() => usePreferences(), { wrapper }).result.current.detectTabSwitchesInPractice).toBe(false);
  });

  it('saves it on the server with the profile and updates the session profile', async () => {
    session.profile = profile(true);
    const saved = profile(false);
    vi.mocked(updateProfile).mockResolvedValue(saved);
    const { result } = renderHook(() => usePreferences(), { wrapper });
    await act(() => result.current.setDetectTabSwitchesInPractice(false));
    expect(updateProfile).toHaveBeenCalledWith({ detect_tab_switches_practice: false });
    expect(session.setProfile).toHaveBeenCalledWith(saved);
  });

  it('keeps the old value when the server refuses', async () => {
    session.profile = profile(true);
    vi.mocked(updateProfile).mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => usePreferences(), { wrapper });
    await expect(act(() => result.current.setDetectTabSwitchesInPractice(false))).rejects.toThrow('nope');
    expect(session.setProfile).not.toHaveBeenCalled();
    expect(result.current.detectTabSwitchesInPractice).toBe(true);
  });
});
