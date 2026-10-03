# Session 07: Compete, contests and profile

You are continuing the **Aptric** frontend re-theme (`frontend/`) from navy and orange to **navy, blue and violet**. Sessions 01 (tokens, logo, primitives) and 02 (shell) are merged. This session re-themes **Compete** (`/compete`: leagues, leaderboards, contests), **contest pages** (`/compete/contests/:id`) and **Profile** (`/profile` and the public `/u/:handle`).

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` (including "Colour roles, old → new") and `README.md`.
2. Read `src/components/ui/*`, `src/components/brand/*` and `/dev/styleguide`.
3. Read `src/pages/Compete.tsx`, `src/components/compete/*` (`ContestStateBadge`, `standings` and the rest), `src/pages/ContestPage.tsx`, `src/pages/Profile.tsx` (`ProfileHeader`, `ProfileForm`, `GoalsForm`, `AppearanceForm`, `FeedbackButton`, `PublicProfile`) and `src/components/profile/*` (`BadgeGrid` and the rest).

Restyle only. The league standings auto-refresh every 20s, and that and all other queries stay as they are.

## Compete (`pages/Compete.tsx`)

- **Tabs**: League, Leaderboards and Contests as pill tabs (keep the `?tab=` URL syncing).
- **League tab**:
  - The **league banner**: a navy gradient card with a violet glow, the tier emblem (re-check the metal tokens against the new navy, and keep Diamond clearly distinct from the brand blue), the tier name, the countdown to reset, and your rank.
  - **Standings**: your own row is highlighted with a soft-blue background and a 3px primary-gradient left bar. Keep the promotion zone (success tint, "↑ Promotion") and demotion zone (danger tint, "↓ Demotion"), and the gold, silver and bronze `RankBadge`s.
  - The "Live · updates every 20s" indicator with a pulsing light-blue dot (reduced-motion aware).
- **Leaderboards tab**: board switcher pills, the **podium** for the top 3 (medal tokens; the winner's column gets a subtle secondary-gradient glow instead of orange), a ranked list, and your own position pinned at the bottom if you're off-screen.
- **Contests tab**: `ContestCard`s with a state badge: Upcoming = blue soft, **Live = violet with a pulsing dot**, Ended = muted. CTAs ("Join", "Enter" or "View results") as primary-gradient or outline pills.

## Contest page (`pages/ContestPage.tsx`)

A navy gradient header card with the title, state badge, a large countdown in tabular numerals (light-blue digits on navy), the rules list and a primary-gradient CTA. The results and standings table reuses the league row styling. Mirror the solve flow's look where the contest embeds `SolveScreen`.

## Profile (`pages/Profile.tsx`)

- **ProfileHeader**: a cover band in the navy gradient with blue and violet glows (or the secondary gradient; pick one), a large avatar overlapping it with a white ring, the display name (bold) and @handle (muted), and the level (violet chip), league tier and streak as chips. Stats and the **badges** grid: earned badges as icon tiles in blue, violet and light-blue tints, locked ones greyed out.
- **Share card**: a navy gradient card with `AptricLogo` (`onDark`), the user's level and streak, and a "Share" outline pill (white on navy).
- **Settings** (`#settings` anchor must keep working): `Section`s as white cards with heading-ink titles and muted descriptions. The theme picker shows preview swatches of the **new** light and dark palettes; the reduced-motion toggle switch is blue (or the primary gradient) when on. A primary-gradient "Save" pill with loading state.
- **FeedbackButton**: an outline pill that opens the restyled dialog.
- **PublicProfile** (`/u/:handle`): the same header and badges, read-only, with no settings.

## Done when

- Lint, typecheck, tests and build pass.
- No orange remains in `Compete.tsx`, `ContestPage.tsx`, `Profile.tsx`, `components/compete/*` or `components/profile/*`.
- You have screenshots (390px and 1280px, light and dark) of: the League tab (you in the promotion zone, you in the demotion zone), Leaderboards with the podium, Contests (upcoming, live and ended), a contest page, Profile with settings, and a public profile. Mock the data.
- Commit ("Re-theme Compete, contests and Profile") and push.
