import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from '@/context/SessionContext';
import { updateProfile } from '@/lib/api';

export type ThemeSetting = 'system' | 'light' | 'dark';
export type MotionSetting = 'system' | 'reduce';

interface Preferences {
  theme: ThemeSetting;
  resolvedTheme: 'light' | 'dark';
  setTheme: (t: ThemeSetting) => void;
  motion: MotionSetting;
  setMotion: (m: MotionSetting) => void;
  /** True when animations should be skipped (OS setting or the in-app switch). */
  reduceMotion: boolean;
  /**
   * "Detect tab switches in Practice" (default on), stored with the profile on the server.
   * Practice only: Daily and contests always detect tab switches, whatever this says.
   */
  detectTabSwitchesInPractice: boolean;
  /** Saves the setting; rejects (and keeps the old value) if the server refuses. */
  setDetectTabSwitchesInPractice: (on: boolean) => Promise<void>;
}

const PreferencesContext = createContext<Preferences | null>(null);

const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage can be unavailable (private mode); the setting just won't persist */
  }
};

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return Boolean(matches);
};

export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeSetting>(() => read('aptric.theme', ['system', 'light', 'dark'], 'system'));
  const [motion, setMotionState] = useState<MotionSetting>(() => read('aptric.motion', ['system', 'reduce'], 'system'));
  const { profile, setProfile } = useSession();
  const detectTabSwitchesInPractice = profile?.detect_tab_switches_practice ?? true;
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const systemReduce = useMediaQuery('(prefers-reduced-motion: reduce)');

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const reduceMotion = motion === 'reduce' || systemReduce;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    // The browser bar matches the app header (--header) of the chosen theme, which can differ
    // from the system one; index.html sets the system theme's value before first paint.
    // Read it from the tokens so they stay in sync.
    const bar = getComputedStyle(root).getPropertyValue('--header').trim();
    if (bar) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bar));
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(motion === 'reduce');
  }, [motion]);

  const setTheme = useCallback((t: ThemeSetting) => {
    setThemeState(t);
    write('aptric.theme', t);
  }, []);
  const setMotion = useCallback((m: MotionSetting) => {
    setMotionState(m);
    write('aptric.motion', m);
  }, []);

  const setDetectTabSwitchesInPractice = useCallback(async (on: boolean) => {
    if (!profile) return;
    setProfile(await updateProfile({ detect_tab_switches_practice: on }));
  }, [profile, setProfile]);

  const value = useMemo(
    () => ({
      theme, resolvedTheme, setTheme, motion, setMotion, reduceMotion,
      detectTabSwitchesInPractice, setDetectTabSwitchesInPractice,
    }) satisfies Preferences,
    [theme, resolvedTheme, setTheme, motion, setMotion, reduceMotion, detectTabSwitchesInPractice, setDetectTabSwitchesInPractice],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return ctx;
};
