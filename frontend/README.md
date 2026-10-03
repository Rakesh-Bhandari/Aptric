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

Navy, blue and violet brand with blue → violet gradients (spec: `prompts/frontend-redesign/BRAND.md`, palette in `brand-spec.jpg`). Everything visual comes from tokens and a few primitives, so pages rarely need their own colours.

**Tokens** live in `src/index.css`: CSS variables on `:root` (light) and `[data-theme='dark']`, exposed to Tailwind through `@theme inline` (`bg-card`, `text-heading`, `bg-navy`, `text-accent-text`…). Don't hard-code hex values or Tailwind palette colours in components; add a token instead and, if it is a text/background pair, add it to `src/test/contrast.test.ts`.

| Group | Tokens |
| --- | --- |
| Surfaces | `background` (`#F8FAFC` / midnight `#0A1020`), `card` (white / `#111A33`), `muted`, `border` (`#E2E8F0`), `input` |
| Text | `foreground`, `heading` (`#0F172A`), `muted-foreground` (`#475569`), `accent-text` (blue text: `#2563EB` light, `#60A5FA` dark), `violet-text` |
| Blue | `primary` `#2563EB`, `primary-strong` `#1D4ED8`, `primary-soft` `#E0E7FF` + `primary-soft-foreground` `#1D4ED8`, `primary-soft-hover` `#C7D2FE`, `primary-wash` `#EFF6FF`, `hover-border` |
| Violet | `violet` `#7C3AED`, `violet-strong`, `violet-soft` (Soft Purple `#EDE9FE`) + `violet-soft-foreground` |
| Light Blue | `sky` `#38BDF8` (icons and links on navy and dark surfaces only), `sky-soft` + `sky-soft-foreground` |
| Navy | `navy` `#0A2540`, `navy-strong`, `navy-soft`, `navy-muted-foreground`, `chrome*` (footer, admin sidebar), `header*` (white header in light, midnight in dark), `on-navy-*` (status and violet text on navy panels) |
| Status | `success`, `danger`, `warning` with `-soft` / `-soft-foreground`, `status-foreground` (text on solid status fills) |
| Game | `streak`, `gold` (the only warm colours, with `warning` and the metals), `tier-*`, `metal-*`, `medal-*`, `chart-accent`, `chart-fill`, `heat-1..4` |
| Shape | `--radius` 16px cards (`rounded-lg`), 12px inputs (`rounded-md`), pills (`rounded-full`); slate-tinted `shadow-sm/md/lg`, `shadow-glow` for the primary button; focus `--ring` (`#2563EB` light, `#38BDF8` dark) and `--ring-on-navy` (`#38BDF8`), 3:1 on every surface |

**Gradients** (`@utility` in `index.css`): `bg-gradient-primary` (`#2563EB` → `#7C3AED`: primary buttons, progress fills, highlights) with `bg-gradient-primary-hover` (`#1D4ED8` → `#6D28D9`); `bg-gradient-secondary` (`#38BDF8` → `#7C3AED`, decorative only, never under text); `bg-gradient-navy` (`#0A2540` → `#1E3A8A`, dark feature panels); `bg-gradient-hero` (the light hero mist); `text-gradient-brand` (the hero's "Grow.": primary gradient on light, `#38BDF8` → `#A78BFA` on dark); `accent-left` (3px gradient bar on explanation cards).

**Buttons** (`components/ui/button.tsx`, all pills): `default` primary-gradient pill with white text, for the **one** main action per screen (a trailing `ArrowRight` nudges right on hover); `secondary` soft blue; `outline` 2px blue border; `violet` for achievement CTAs; `navy` (rare: icon buttons on light panels); `ghost`; `danger`; `link`. Sizes `sm` (36px with a 44px hit area), `md` 44px, `lg` 48px, `icon` 44px.

**Chips** (`Badge`): `blue` soft blue for interactive and info, `default` Soft Purple for badges and kinds, `violet` solid for achievements and live, `navy`, `solid`, `muted`, `outline` and the status variants.

**Other primitives** in `components/ui`: `Card` (`variant="navy"` for hero panels, which also switches `--ring` to Light Blue; `soft` Soft Purple), `Tabs` (segmented pills, the active tab is a card with blue text), `StatTile` (`navy`/`blue`/`violet` tones) and `PageHeader` (`page.tsx`), `EmptyState` / `ErrorState`, `Skeleton` / `LoadingRegion`, `Progress` (gradient fill) and ring, `Stars`, `Input`, `Dialog` (`variant="brand"` for the auth dialog).

**Logo** (`components/brand`): `AptricMark` (the ribbon "A" as inline SVG: navy leg, cyan → blue ribbon, light blue → violet crossbar; `variant="onDark"` lifts the navy leg on navy and midnight surfaces, `onLight` keeps the original navy), `AptricWordmark` ("APTRIC" with the Light Blue triangle; navy, or white in dark mode and `onDark`), and `AptricLogo` (mark + wordmark, `inline`/`stacked`, `sm`/`md`/`lg`, `markOnly`). Never use the JPGs in `public/brand` in the UI; they are on white. `favicon.svg`, the PNG icons, `LOGO.png` and `brand/og.png` are generated from the same artwork.

**Style guide**: `npm run dev` and open [`/dev/styleguide`](http://localhost:6969/dev/styleguide) for every token, gradient, button, chip and logo variant in both themes. It's dev-only (`import.meta.env.DEV`), so it isn't in production builds.

**Accessibility deviations from the spec** (WCAG AA, enforced by `src/test/contrast.test.ts`):

- The secondary button uses `#1D4ED8` text on `#E0E7FF` (5.4:1) instead of `#2563EB` (4.2:1), and `#1E40AF` on the hover fill `#C7D2FE`.
- Light Blue `#38BDF8` is never used for text or meaningful icons on light surfaces (2.1:1 on white); it is the link, icon and focus colour on navy and dark surfaces only. White text never sits on it either, so the spec's dark-hero light blue → blue button is the normal primary gradient.
- Blue text on a muted grey surface (`#E2E8F0`) uses `#1D4ED8`, since `#2563EB` is 4.2:1 there.
- Gradient text uses the primary gradient on light and `#38BDF8` → `#A78BFA` on dark (violet is under 3:1 on navy).
- Inputs show a solid 2px ring on focus (a translucent halo fell under 3:1).

**Motion**: 150–250ms ease-out, always `motion-safe:` and switched off by the in-app "Reduce motion" setting (`data-reduce-motion`, set before first paint by the script in `index.html`). Confetti uses the `.confetti` class, which both settings hide; the button arrow nudge, scroll reveals, shimmer, pulses and typing dots all stop too.

**Theme**: light, dark or device (Settings). The script in `index.html` applies the saved theme before first paint, and `theme-color` follows the header (`--header`: white or `#0B1226`).

### Visual and accessibility checks

`e2e/` holds Playwright checks against a mocked API (`e2e/fixtures/`: fixture data, `mockApi()` and the list of every route). They use the Chromium at `/opt/pw-browsers` when it exists.

```bash
npm run e2e                                    # axe (serious/critical), focus rings, no horizontal scroll at 360px, tab bar clearance,
                                               # reduced motion (OS and in-app), layout shift
npm run e2e:shots                              # every route at 360/390/768/1280, light and dark, into e2e/.screenshots
SHOTS=1 MAIN=1 SHOT_DIR=shots npx playwright test screenshots   # main routes at 390 and 1280 only
AUDIT=1 npx playwright test audit              # per-route report of small tap targets and all axe findings (e2e/.audit)
npx playwright test focus                      # focus ring visible at 3:1 on every tabbable element, main routes, both themes
```
