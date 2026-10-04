import { useCallback, useEffect, useRef, useState } from 'react';

/** Set on <html> while a question is on screen; index.css keys copy/print blocking off it. */
export const PROTECTED_ATTR = 'data-protected';

const isEditable = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]');

// Ctrl/Cmd + C copy, X cut, A select all, S save, P print, U view source.
const BLOCKED_COMBOS = new Set(['c', 'x', 'a', 's', 'p', 'u']);
// Ctrl/Cmd + Shift + I/J/C open the developer tools.
const DEVTOOLS_COMBOS = new Set(['i', 'j', 'c']);

/**
 * Makes the question screen non-copyable: no text selection, copy/cut,
 * right-click menu, dragging text out, printing or saving the page, and the
 * usual dev-tools shortcuts. Form fields (e.g. the report dialog) still work.
 */
export const useCopyProtection = () => {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(PROTECTED_ATTR, '');
    window.getSelection()?.removeAllRanges();

    const block = (e: Event) => {
      if (isEditable(e.target)) return;
      e.preventDefault();
    };
    const blockClipboard = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      e.preventDefault();
      // Overwrite rather than leave whatever was copied before.
      e.clipboardData?.setData('text/plain', '');
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const devtools = key === 'f12' || (mod && e.shiftKey && DEVTOOLS_COMBOS.has(key)) || (e.metaKey && e.altKey && DEVTOOLS_COMBOS.has(key));
      if (devtools || (mod && !e.altKey && BLOCKED_COMBOS.has(key) && !isEditable(e.target))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Best effort: wipe the clipboard right after a PrintScreen capture.
      if (e.key === 'PrintScreen') void navigator.clipboard?.writeText('').catch(() => {});
    };

    const listeners: [string, EventListener][] = [
      ['copy', blockClipboard as EventListener],
      ['cut', blockClipboard as EventListener],
      ['contextmenu', block],
      ['selectstart', block],
      ['dragstart', block],
      ['keydown', onKeyDown as EventListener],
      ['keyup', onKeyUp as EventListener],
    ];
    for (const [type, fn] of listeners) document.addEventListener(type, fn, true);
    return () => {
      root.removeAttribute(PROTECTED_ATTR);
      for (const [type, fn] of listeners) document.removeEventListener(type, fn, true);
    };
  }, []);
};

export interface AwayWarning {
  /** Times the player has left during this session. */
  count: number;
  /** How long they were gone this time. */
  awayMs: number;
}

const storageKey = () => `aptric:tab-switches:${window.location.pathname}${window.location.search}`;

const readCount = () => {
  try {
    return Number(sessionStorage.getItem(storageKey())) || 0;
  } catch {
    return 0;
  }
};

const writeCount = (count: number) => {
  try {
    sessionStorage.setItem(storageKey(), String(count));
  } catch {
    // Storage blocked: the count just won't survive a reload.
  }
};

/**
 * Tab-switch detection while `active`: catches switching tabs, minimising,
 * alt-tabbing to another app or window, focusing the address bar or browser
 * UI, opening dev tools and leaving through pagehide. Overlapping signals
 * (blur + visibilitychange) count as one departure.
 *
 * `away` is true while the player is gone, so the question can be hidden;
 * `warning` is set on return until acknowledged. The count lives in
 * sessionStorage per session URL, so reloading the page doesn't reset it.
 */
export const useTabSwitchGuard = (active: boolean) => {
  const [count, setCount] = useState(readCount);
  const [away, setAway] = useState(false);
  const [warning, setWarning] = useState<AwayWarning | null>(null);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    const leave = () => {
      if (leftAt.current !== null) return;
      leftAt.current = Date.now();
      const next = readCount() + 1;
      writeCount(next);
      setCount(next);
      setAway(true);
    };
    const back = () => {
      if (leftAt.current === null) return;
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      const awayMs = Date.now() - leftAt.current;
      leftAt.current = null;
      setAway(false);
      setWarning({ count: readCount(), awayMs });
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? leave() : back());

    // Already in the background when the question appeared.
    if (document.visibilityState === 'hidden') leave();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', leave);
    window.addEventListener('pagehide', leave);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', leave);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('focus', back);
      leftAt.current = null;
      setAway(false);
    };
  }, [active]);

  const acknowledge = useCallback(() => setWarning(null), []);
  return { count, away, warning, acknowledge };
};

export type ContestGuardReason = 'tab_hidden' | 'window_blur' | 'fullscreen_exit';

/** A blur that ends within this long (focus flicker, a tooltip, autofill) is not a departure. */
export const BLUR_GRACE_MS = 400;

/**
 * Contest integrity while `active`: the first of these calls `onViolation(reason)`, once.
 *
 * - `tab_hidden`: the page became hidden (other tab, minimised window, screen lock, reload).
 * - `window_blur`: the window lost focus (another app or window, browser UI) and still
 *   hadn't it back after `blurGraceMs`, so focus flicker doesn't count. Focus moving to an
 *   iframe inside the page doesn't count either.
 * - `fullscreen_exit`: leaving fullscreen that the player was in. Fullscreen is never
 *   requested, so this only applies to players who entered it themselves.
 *
 * Known limits: a browser prompt or native dialog that holds focus longer than the grace
 * period can still read as a blur, and the checks are client-side signals; the server only
 * records and enforces what the client reports. See "Contest fair play" in the README.
 */
export const useContestGuard = (
  active: boolean,
  onViolation: (reason: ContestGuardReason) => void,
  blurGraceMs = BLUR_GRACE_MS,
) => {
  const handler = useRef(onViolation);
  useEffect(() => {
    handler.current = onViolation;
  });

  useEffect(() => {
    if (!active) return;
    let fired = false;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    let wasFullscreen = !!document.fullscreenElement;

    const fire = (reason: ContestGuardReason) => {
      if (fired) return;
      fired = true;
      clearTimeout(blurTimer);
      handler.current(reason);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') fire('tab_hidden');
    };
    const onBlur = () => {
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement || document.hasFocus()) return;
        fire('window_blur');
      }, blurGraceMs);
    };
    const onFocus = () => clearTimeout(blurTimer);
    const onFullscreen = () => {
      if (document.fullscreenElement) wasFullscreen = true;
      else if (wasFullscreen) fire('fullscreen_exit');
    };

    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(blurTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [active, blurGraceMs]);
};
