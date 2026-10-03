import { createContext, useContext, useLayoutEffect } from 'react';

/**
 * What sits under a transparent header: `dark` for a hero that is dark in both
 * themes (the header switches to its dark tokens while transparent), `theme` for a
 * hero that follows the page theme (the header keeps the page's tokens).
 */
export type HeaderOverlayTone = 'dark' | 'theme';

/**
 * Lets a page with its own hero (the landing page) ask the AppShell header to sit
 * transparently over it and turn solid once the page scrolls. The page pulls
 * itself up under the header (-mt-16) and pads its hero top by the same amount,
 * so nothing else moves when the overlay turns on (no layout shift).
 */
export const HeaderOverlayContext = createContext<((tone: HeaderOverlayTone | null) => void) | null>(null);

export const useHeaderOverlay = (enabled = true, tone: HeaderOverlayTone = 'dark') => {
  const set = useContext(HeaderOverlayContext);
  // Before paint, so the header is never drawn solid over the hero first.
  useLayoutEffect(() => {
    if (!set || !enabled) return;
    set(tone);
    return () => set(null);
  }, [set, enabled, tone]);
};
