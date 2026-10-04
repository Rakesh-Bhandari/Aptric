import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLUR_GRACE_MS, useContestGuard } from './useExamGuard';

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};
const setFocus = (focused: boolean) => vi.spyOn(document, 'hasFocus').mockReturnValue(focused);
const setFullscreen = (el: Element | null) => {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => el });
  document.dispatchEvent(new Event('fullscreenchange'));
};

describe('useContestGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setFocus(true);
    setVisibility('visible');
    setFullscreen(null);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const setup = (active = true) => {
    const onViolation = vi.fn();
    const hook = renderHook(({ on }) => useContestGuard(on, onViolation), { initialProps: { on: active } });
    return { onViolation, ...hook };
  };

  it('treats the page becoming hidden as a violation, immediately', () => {
    const { onViolation } = setup();
    setVisibility('hidden');
    expect(onViolation).toHaveBeenCalledExactlyOnceWith('tab_hidden');
  });

  it('reports only the first violation (blur then hidden is one departure)', () => {
    const { onViolation } = setup();
    act(() => { setFocus(false); window.dispatchEvent(new Event('blur')); });
    setVisibility('hidden');
    act(() => { vi.advanceTimersByTime(BLUR_GRACE_MS * 2); });
    expect(onViolation).toHaveBeenCalledExactlyOnceWith('tab_hidden');
  });

  it('treats losing window focus as a violation once the grace period passes', () => {
    const { onViolation } = setup();
    setFocus(false);
    window.dispatchEvent(new Event('blur'));
    act(() => { vi.advanceTimersByTime(BLUR_GRACE_MS - 1); });
    expect(onViolation).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onViolation).toHaveBeenCalledExactlyOnceWith('window_blur');
  });

  it('ignores a blur that comes straight back (focus flicker)', () => {
    const { onViolation } = setup();
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    act(() => { vi.advanceTimersByTime(BLUR_GRACE_MS * 5); });
    expect(onViolation).not.toHaveBeenCalled();
  });

  it('ignores a blur when the document still has focus, or focus moved into an iframe', () => {
    const { onViolation } = setup();
    window.dispatchEvent(new Event('blur'));
    act(() => { vi.advanceTimersByTime(BLUR_GRACE_MS); });
    expect(onViolation).not.toHaveBeenCalled();

    const frame = document.body.appendChild(document.createElement('iframe'));
    frame.focus();
    setFocus(false);
    window.dispatchEvent(new Event('blur'));
    act(() => { vi.advanceTimersByTime(BLUR_GRACE_MS); });
    expect(onViolation).not.toHaveBeenCalled();
    frame.remove();
  });

  it('treats exiting fullscreen as a violation only if the player was in fullscreen', () => {
    const { onViolation } = setup();
    setFullscreen(null);
    expect(onViolation).not.toHaveBeenCalled();
    setFullscreen(document.body);
    expect(onViolation).not.toHaveBeenCalled();
    setFullscreen(null);
    expect(onViolation).toHaveBeenCalledExactlyOnceWith('fullscreen_exit');
  });

  it('fires at once if the page is already hidden when the attempt starts', () => {
    setVisibility('hidden');
    const { onViolation } = setup();
    expect(onViolation).toHaveBeenCalledExactlyOnceWith('tab_hidden');
  });

  it('does nothing while inactive and stops listening once it is turned off', () => {
    const { onViolation, rerender } = setup(false);
    setVisibility('hidden');
    expect(onViolation).not.toHaveBeenCalled();

    setVisibility('visible');
    rerender({ on: true });
    rerender({ on: false });
    setVisibility('hidden');
    expect(onViolation).not.toHaveBeenCalled();
  });
});
