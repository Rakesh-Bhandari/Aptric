import { useEffect, useRef } from 'react';

interface Handlers {
  optionCount: number;
  enabled: boolean;
  onPick: (index: number) => void;
  onEnter: () => void;
}

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
};

/**
 * Solve-screen shortcuts: 1–9 pick an option, Enter checks the answer (or
 * moves on once it's checked). Ignored while typing or when a dialog is open.
 */
export const useSolveKeys = ({ optionCount, enabled, onPick, onEnter }: Handlers) => {
  const ref = useRef({ optionCount, enabled, onPick, onEnter });
  ref.current = { optionCount, enabled, onPick, onEnter };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      if (!h.enabled || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      if (isTyping(e.target) || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

      if (/^[1-9]$/.test(e.key)) {
        const index = Number(e.key) - 1;
        if (index < h.optionCount) {
          e.preventDefault();
          h.onPick(index);
        }
        return;
      }
      if (e.key === 'Enter') {
        // Let Enter activate a focused button/link the normal way, except on
        // the option that's already picked, where it means "check my answer".
        const el = e.target as HTMLElement | null;
        const onPickedOption = el?.dataset.optionPicked === 'true';
        if (el && !onPickedOption && (el.tagName === 'BUTTON' || el.tagName === 'A')) return;
        e.preventDefault();
        h.onEnter();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
};
