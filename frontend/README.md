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
- **Mobile first**: bottom tab bar under `md`, sticky action bar on the solve screen, 44px+ tap targets, no horizontal scroll at 360px.
- **Themes**: colour tokens in `src/index.css` for light and dark; `src/test/contrast.test.ts` checks every text/background pair against WCAG AA. Theme is "match device", light or dark (Settings).
- **Motion**: animations are `motion-safe` and also turned off by the in-app "Reduce motion" setting (`data-reduce-motion`).
- **Loading and errors**: skeletons for every page/card, inline `ErrorState` with retry for failed queries, an `ErrorBoundary` per layout (resets on navigation, spots stale chunks after a deploy), a router `errorElement`, and a 404 page.

## Design system

Navy and orange brand (spec: `prompts/frontend-redesign/BRAND.md`). Everything visual comes from tokens and a few primitives, so pages rarely need their own colours.

**Tokens** live in `src/index.css`: CSS variables on `:root` (light) and `[data-theme='dark']`, exposed to Tailwind through `@theme inline` (`bg-card`, `text-heading`, `bg-navy`, `text-accent-text`…). Don't hard-code hex values or Tailwind palette colours in components; add a token instead and, if it is a text/background pair, add it to `src/test/contrast.test.ts`.

| Group | Tokens |
| --- | --- |
| Surfaces | `background` (Off White / Dark Navy), `card`, `muted`, `border`, `input` |
| Text | `foreground`, `heading`, `muted-foreground`, `accent-text` (orange text that passes AA) |
| Brand | `primary` / `primary-strong` / `primary-soft` (orange), `navy` / `navy-strong` / `navy-soft`, `chrome*` (navy header, footer, admin sidebar), gradients `bg-gradient-navy`, `bg-gradient-orange`, `bg-gradient-hero` |
| Status | `success`, `danger`, `warning` with `-soft` / `-soft-foreground`, `status-foreground` (text on solid status fills), `on-navy-*` (status on navy panels) |
| Game | `streak`, `gold`, `tier-*`, `metal-*`, `medal-*`, `chart-accent`, `heat-1..4` |
| Shape | `--radius` 16px cards (`rounded-lg`), 12px inputs (`rounded-md`), pills (`rounded-full`); navy-tinted `shadow-sm/md/lg`; focus `--ring` (3:1 on every surface, navy included) |

**Buttons** (`components/ui/button.tsx`, pills): `default` orange CTA (one per screen), `navy` secondary, `outline` navy outline, `secondary` soft orange, `ghost`, `danger`, `link`. Sizes `sm` (36px with a 44px hit area), `md` 44px, `lg` 48px, `icon` 44px.

**Other primitives** in `components/ui`: `Card` (`variant="navy"` for hero panels), `Badge` chips (`default`, `navy`, `solid`, `muted`, status variants), `Tabs` (segmented pills: navy active in light, orange in dark), `StatTile` and `PageHeader` (`page.tsx`), `EmptyState` / `ErrorState`, `Skeleton` / `LoadingRegion`, `Progress` / ring, `Input`, `Dialog` (`variant="brand"` for the auth dialog).

**Logo** (`components/brand`): `AptricMark` (the ribbon "A" as SVG; `variant="onDark"` lifts the navy leg on navy surfaces, `onLight` keeps the original navy), `AptricWordmark`, and `AptricLogo` (mark + wordmark, `inline`/`stacked`, `sm`/`md`/`lg`, `markOnly`). Never use the JPGs in `public/brand` in the UI; they are on white.

**Style guide**: `npm run dev` and open [`/dev/styleguide`](http://localhost:6969/dev/styleguide) for every token, button, chip and logo variant in both themes. It's dev-only (`import.meta.env.DEV`), so it isn't in production builds.

**Accessibility deviation from the spec**: orange buttons use **Dark Navy text** (`--primary-foreground`, about 6:1) instead of white, because white on `#FF7800` is about 2.6:1 and fails WCAG AA. Orange text on light surfaces uses `--accent-text` (`#C2410C`). If white button text is wanted later, the orange itself has to darken (for example `#C2410C`).

**Motion**: 150–250ms ease-out, always `motion-safe:` and switched off by the in-app "Reduce motion" setting (`data-reduce-motion`, set before first paint by the script in `index.html`). Confetti uses the `.confetti` class, which both settings hide.

### Visual and accessibility checks

`e2e/` holds Playwright checks against a mocked API (`e2e/fixtures/`: fixture data, `mockApi()` and the list of every route). They use the Chromium at `/opt/pw-browsers` when it exists.

```bash
npm run e2e                                    # axe (serious/critical), no horizontal scroll at 360px, tab bar clearance,
                                               # reduced motion (OS and in-app), layout shift
npm run e2e:shots                              # every route at 360/390/768/1280, light and dark, into e2e/.screenshots
SHOTS=1 MAIN=1 SHOT_DIR=shots npx playwright test screenshots   # main routes at 390 and 1280 only
AUDIT=1 npx playwright test audit              # per-route report of small tap targets and all axe findings (e2e/.audit)
```
