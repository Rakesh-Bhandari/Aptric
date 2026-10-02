# Session 07: Compete, contests and profile

You are continuing the **Aptric** frontend redesign (`frontend/`). Sessions 01 (tokens, logo, primitives) and 02 (shell) are merged. This session restyles **Compete** (`/compete`: leagues, leaderboards, contests), **contest pages** (`/compete/contests/:id`) and **Profile** (`/profile` and the public `/u/:handle`).

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `README.md`.
2. Read `src/components/ui/*`, `src/components/brand/*` and `/dev/styleguide`.
3. Read `src/pages/Compete.tsx` (`LeagueTab`, `LeaderboardsTab`, `ContestsTab`, `RankBadge`, `PlayerLink`, `ContestCard`, `ContestStateBadge`), `src/pages/ContestPage.tsx` and `src/pages/Profile.tsx` (`ProfileHeader`, `ProfileForm`, `GoalsForm`, `AppearanceForm`, `FeedbackButton`, `PublicProfile`).

Restyle only. The league standings auto-refresh every 20s, and that and all other queries stay as they are.

## Compete (`pages/Compete.tsx`)

- **Tabs**: League, Leaderboards and Contests as pill tabs (keep the `?tab=` URL syncing).
- **League tab**:
  - A **league banner**: a navy gradient card with the tier emblem (an SVG shield or gem per tier, Bronze → Silver → Gold → Platinum → Diamond, tinted with metal colours that sit well beside navy and orange and are added as tokens), the tier name, the week's countdown to reset, and your rank.
  - **Standings**: rows with rank, avatar, name or handle, and weekly XP. Your own row is highlighted (soft-orange background, orange left bar). Add zone separators: a **promotion zone** (success-tinted rows with a small "↑ Promotion" divider label) and a **demotion zone** (danger-tinted with "↓ Demotion"). Ranks 1, 2 and 3 get gold, silver and bronze `RankBadge`s.
  - A subtle "Live · updates every 20s" indicator with a pulsing dot (reduced-motion aware).
- **Leaderboards tab**: board switcher pills (weekly, all-time, rating), a **podium** for the top 3 (the centre is tallest, with avatars, the metric and the orange or gold accents) above a ranked list, and your own position pinned at the bottom if you're off-screen.
- **Contests tab**: `ContestCard`s with the title, the schedule, the number of questions and duration, and a state badge (Upcoming = navy soft, **Live = orange with a pulsing dot**, Ended = muted), with CTAs ("Join", "Enter" or "View results").

## Contest page (`pages/ContestPage.tsx`)

A header card (navy gradient) with the contest title, state badge, countdown (tabular numerals, large), rules list and an orange CTA. The results and standings table reuses the league row styling. Mirror the solve flow's look where the contest embeds `SolveScreen` (session 05 restyles it).

## Profile (`pages/Profile.tsx`)

- **ProfileHeader**: a navy gradient cover band, a large avatar overlapping it with a white ring, the display name (bold) and @handle (muted), and the level, league tier and streak as chips. Add stats (questions solved, accuracy, best streak) and a **badges** grid of earned badges as icon tiles in brand colours, with locked ones greyed out.
- **Share card**: the existing share card restyled as a navy gradient card with the `AptricLogo` (white), the user's level and streak, and a "Share" outline pill.
- **Settings** (`#settings` anchor must keep working): `Section`s as white cards with navy titles and muted descriptions. `Choice` radios become pill segmented controls or selectable cards (theme: Light, Dark, Device, with small preview swatches in both palettes; reduced motion as a toggle switch styled orange when on). Use the new inputs for the profile, goal and time zone forms, and an orange "Save" pill with loading state.
- **FeedbackButton**: an outline pill that opens the restyled dialog.
- **PublicProfile** (`/u/:handle`): the same header and badges, read-only, with no settings.

## Done when

- Lint, typecheck, tests and build pass.
- You have screenshots (390px and 1280px, light and dark) of: the League tab (you in the promotion zone, you in the demotion zone), Leaderboards with the podium, Contests (upcoming, live and ended), a contest page, Profile with settings, and a public profile. Mock the data.
- Commit ("Redesign Compete, contests and Profile") and push.
