# Aptric frontend

React 19 + TypeScript + Vite, TanStack Query for server state, a small `fetch` client for the Aptric API (`backend/`), Tailwind CSS v4 with shadcn-style components (Radix primitives), KaTeX + Marked for question Markdown and math.

```bash
cp .env.example .env.local   # set VITE_API_URL (the backend, e.g. http://localhost:5000)
npm install
npm run dev                  # http://localhost:6969
npm run build                # typecheck + production build
npm run lint
npm test                     # vitest (unit, component and colour-contrast tests)
```

Every game rule (grading, hints, XP, streaks, levels, placement, contests) lives in Postgres; the API runs those SQL functions as the signed-in user (`POST /rpc/:name`) and `src/lib/api.ts` is a typed wrapper over them. `src/lib/http.ts` holds the session (localStorage, refreshed on demand, synced across tabs) and `src/lib/auth.ts` the sign-in calls. Types come from `supabase/types/database.types.ts` (`@db/*`).

## Screens

| Route | Screen |
| --- | --- |
| `/` | **Today**: daily challenge card, streak, daily goal ring, level, league position. Signed-out visitors get the landing page. |
| `/solve/daily` | **Solve** the daily challenge: one question at a time, large options, visible timer, `1`–`4` / `Enter`, "Show hint (−N)", "Give up & see answer", result card with explanation and "Practice similar". |
| `/practice` | **Practice**: section → topic → subtopic with mastery stars, search, preferred difficulty, weak-areas mode. |
| `/practice/session?subtopics=…&difficulty=…&mode=weak` | Practice session (10 new questions). |
| `/session/summary` | **Session summary**: score, XP, time, per-question outcomes, level-ups/badges/rating, share, follow-ups. |
| `/compete` | **Compete**: weekly league (refreshed every 20 s), leaderboards (week / all time / rating), contests. `/compete/contests/:id` plays a contest. |
| `/progress` | **Progress**: skill radar + table, activity heatmap and recent daily sets, mistakes to review with explanations. |
| `/profile` | **Profile & settings**: profile, exam goal, daily target, time zone, placement retake, theme, reduced motion, feedback, sign out. `/u/:handle` is a public profile. |
| `/onboarding` | Username → exam goal + daily target → 10-question placement test → starting level. |
| `/admin/*` | Admin area (JS, unchanged behaviour). |

## Conventions

- **Wording**: plain and friendly ("Check answer", "Give up & see answer"); errors go through `friendlyError()` / `authErrorMessage()`.
- **Mobile first**: bottom tab bar under `md`, sticky action bar on the solve screen, 44px+ tap targets, no horizontal scroll at 390px.
- **Themes**: colour tokens in `src/index.css` for light and dark; `src/test/contrast.test.ts` checks every text/background pair against WCAG AA. Theme is "match device", light or dark (Settings).
- **Motion**: animations are `motion-safe` and also turned off by the in-app "Reduce motion" setting (`data-reduce-motion`).
- **Loading and errors**: skeletons for every page/card, inline `ErrorState` with retry for failed queries, an `ErrorBoundary` per layout (resets on navigation, spots stale chunks after a deploy), a router `errorElement`, and a 404 page.
