/**
 * useAntiCheat.js
 * ───────────────
 * Reusable hook that applies lightweight anti-cheat protections to exam/quiz pages:
 *
 *  1. Blocks right-click context menu
 *  2. Blocks keyboard copy/cut shortcuts (Ctrl+C, Ctrl+X, Ctrl+A, Ctrl+P, PrintScreen)
 *  3. Disables CSS user-select on the target element (via class on <html>)
 *  4. Detects tab/window switching (Page Visibility API) and fires onTabSwitch callback
 *  5. Blocks browser Print (Ctrl+P) and adds @media print { display:none }
 *
 * Usage:
 *   useAntiCheat({ onTabSwitch: (count) => console.log('switched', count) });
 */

import { useEffect, useRef } from 'react';

const STYLE_ID = 'anti-cheat-style';

const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        /* Disable text selection site-wide while anti-cheat is active */
        body.anti-cheat-active *:not(input):not(textarea) {
            user-select: none !important;
            -webkit-user-select: none !important;
        }
        /* Hide everything when printing */
        @media print {
            body.anti-cheat-active * { display: none !important; }
            body.anti-cheat-active::after {
                display: block !important;
                content: "Printing is disabled on this page.";
                font-size: 1.5rem;
                text-align: center;
                margin-top: 4rem;
            }
        }
    `;
    document.head.appendChild(style);
};

const removeStyle = () => {
    document.getElementById(STYLE_ID)?.remove();
};

const useAntiCheat = ({ onTabSwitch, enabled = true } = {}) => {
    const tabSwitchCount = useRef(0);

    useEffect(() => {
        // If disabled (e.g. for admin accounts), do nothing
        if (!enabled) return;

        document.body.classList.add('anti-cheat-active');
        injectStyle();

        // ── 2. Block context menu ─────────────────────────────────
        const blockContextMenu = (e) => e.preventDefault();

        // ── 3. Block keyboard shortcuts ───────────────────────────
        const blockKeys = (e) => {
            const blockedCombos = [
                e.ctrlKey && ['c', 'x', 'a', 'p', 's', 'u'].includes(e.key.toLowerCase()),
                e.metaKey && ['c', 'x', 'a', 'p', 's', 'u'].includes(e.key.toLowerCase()),
                e.key === 'PrintScreen',
                e.key === 'F12', // DevTools
            ];
            if (blockedCombos.some(Boolean)) {
                e.preventDefault();
                e.stopPropagation();
                // Silently clear clipboard if PrintScreen was hit
                if (e.key === 'PrintScreen') {
                    navigator.clipboard?.writeText('').catch(() => { });
                }
            }
        };

        // ── 4. Tab/window visibility detection ────────────────────
        const handleVisibilityChange = () => {
            if (document.hidden) {
                tabSwitchCount.current += 1;
                onTabSwitch?.(tabSwitchCount.current);
            }
        };

        // ── 5. Block drag (prevents drag-copy) ────────────────────
        const blockDrag = (e) => e.preventDefault();

        document.addEventListener('contextmenu', blockContextMenu);
        document.addEventListener('keydown', blockKeys, true);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('dragstart', blockDrag);

        return () => {
            // Cleanup: remove all listeners and restore normal behaviour
            document.body.classList.remove('anti-cheat-active');
            removeStyle();
            document.removeEventListener('contextmenu', blockContextMenu);
            document.removeEventListener('keydown', blockKeys, true);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('dragstart', blockDrag);
        };
    }, []); // only once per mount

    return { tabSwitchCount };
};

export default useAntiCheat;