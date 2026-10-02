import { useEffect, type RefObject } from 'react';

/**
 * Fades up every `[data-reveal]` element inside `root` the first time it scrolls
 * into view, by setting `data-revealed` (the CSS lives in index.css). The CSS only
 * hides unrevealed elements when motion is allowed, so reduced motion needs no
 * special case here. Without IntersectionObserver everything is revealed at once.
 */
export const useReveal = (root: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const targets = [...el.querySelectorAll<HTMLElement>('[data-reveal]')];
    const show = (t: Element) => t.setAttribute('data-revealed', '');
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach(show);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        show(entry.target);
        io.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [root]);
};

/** True when the OS or the in-app switch asks for reduced motion. */
export const prefersReducedMotion = () =>
  document.documentElement.dataset.reduceMotion === 'true' ||
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
