# Frontend redesign: session prompts

These prompts restyle the Aptric web app (`frontend/`) to the new brand (navy and orange, ribbon "A" logo). The work is split into sessions that each fit in one Claude Code run. Run them **in order**, because sessions 02–09 build on the tokens and components from session 01.

| # | File | Scope | Depends on |
| --- | --- | --- | --- |
| 01 | `01-foundation.md` | Brand tokens, fonts, logo SVG components, favicon, UI primitives, contrast test | — |
| 02 | `02-app-shell.md` | Header, nav, mobile tab bar, footer, user menu, auth dialog, error, 404 and skeleton states | 01 |
| 03 | `03-landing-and-public.md` | Marketing landing page, Terms, auth callback, reset password | 01, 02 |
| 04 | `04-today-and-onboarding.md` | Today dashboard, onboarding and the placement test | 01, 02 |
| 05 | `05-solve-flow.md` | Solve screen, daily and practice sessions, session summary, report dialog, Markdown and KaTeX | 01 |
| 06 | `06-practice-and-progress.md` | Practice browser, Progress page, skill radar, activity heatmap | 01, 02 |
| 07 | `07-compete-and-profile.md` | Leagues, leaderboards, contests, profile, public profile, settings | 01, 02 |
| 08 | `08-admin.md` | Admin area (`src/admin/*`, `Admin.css`) | 01 |
| 09 | `09-polish-and-qa.md` | Cross-page consistency, responsive layout, dark mode, a11y, screenshots, final cleanup | all |

After session 01, sessions 03–08 only touch their own files, so they can run in parallel on separate branches. Merge 01 and 02 first.

## How to run a session

1. Start a new Claude Code session on the repo, on a fresh branch from the latest `main`.
2. Paste the session file's contents as the first message, or say: *"Follow `prompts/frontend-redesign/0N-....md`"*.
3. Each prompt tells the session to read `BRAND.md` first, verify with `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` in `frontend/`, and then commit and push.
4. Review the screenshots the session reports, then merge before you start the next dependent session.

## Shared rules (every session follows these)

- Read `prompts/frontend-redesign/BRAND.md` and look at the three brand images before you edit anything.
- This is a **visual redesign**. Don't change data fetching, RPCs, routes, auth, game rules or copy meaning. Wording can be tightened to match the new tone.
- Use the tokens and components from session 01 (`AptricMark`, `AptricLogo`, `Button` variants and so on). Don't hard-code hex values in components. If a colour is missing, add a token.
- Mobile first: the layout must work at 360px wide with no horizontal scroll, and tap targets must be at least 44px.
- Both themes must work. Check every screen you touch in light and dark mode.
- Keep `src/test/contrast.test.ts` passing, and add any new text and background token pairs to it.
- Before you finish, run `npm run lint && npm run typecheck && npm test && npm run build` in `frontend/`, and fix what fails.
- Take Playwright screenshots of the screens you changed at 390px and 1280px, in light and dark mode (Chromium is at `/opt/pw-browsers`). Use `npm run dev`, and mock or stub the API if a backend isn't running. List anything you couldn't render.
- Commit with a clear message, push, and end with a short summary: files changed, any deviations from the spec, and follow-ups for later sessions.
