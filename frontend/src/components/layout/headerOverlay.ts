import { createContext, useContext, useLayoutEffect } from 'react';

/**
 * Lets a page with its own navy hero (the landing page) ask the AppShell header
 * to sit transparently over it and turn solid once the page scrolls. The page
 * pulls itself up under the header (-mt-16) and pads its hero top by the same
 * amount, so nothing else moves when the overlay turns on (no layout shift).
 */
export const HeaderOverlayContext = createContext<((on: boolean) => void) | null>(null);

export const useHeaderOverlay = (enabled = true) => {
  const set = useContext(HeaderOverlayContext);
  // Before paint, so the header is never drawn solid over the hero first.
  useLayoutEffect(() => {
    if (!set || !enabled) return;
    set(true);
    return () => set(false);
  }, [set, enabled]);
};
