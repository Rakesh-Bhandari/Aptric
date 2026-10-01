import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Milliseconds since mount, ticking once a second while `running`, frozen
 * once it stops. Mount a fresh component (key it) for each question.
 */
export const useElapsed = (running: boolean) => {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  const stoppedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      stoppedAt.current ??= Date.now();
      setNow(stoppedAt.current);
      return;
    }
    stoppedAt.current = null;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  /** Exact elapsed time at the moment of the call (for submitting). */
  const read = useCallback(() => (stoppedAt.current ?? Date.now()) - start, [start]);
  return { elapsed: Math.max(0, now - start), read };
};
