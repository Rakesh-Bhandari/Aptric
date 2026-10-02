import { createContext, useContext, useEffect } from 'react';

/**
 * Lets a page with its own navy hero (the landing page) ask the AppShell header
 * to sit transparently over it and turn solid once the page scrolls. The page
 * is responsible for padding its hero top by the header height (h-16).
 */
export const HeaderOverlayContext = createContext<((on: boolean) => void) | null>(null);

export const useHeaderOverlay = (enabled = true) => {
  const set = useContext(HeaderOverlayContext);
  useEffect(() => {
    if (!set || !enabled) return;
    set(true);
    return () => set(false);
  }, [set, enabled]);
};
