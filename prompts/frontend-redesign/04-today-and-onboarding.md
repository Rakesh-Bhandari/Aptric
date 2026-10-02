# Session 04: Today dashboard and onboarding

You are continuing the **Aptric** frontend redesign (`frontend/`). Sessions 01 (tokens, logo, primitives) and 02 (shell) are merged. This session restyles the **signed-in home** (`/`, Today) and the **onboarding and placement flow**.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `README.md`, and look at `brand-spec.jpg`.
2. Read `/dev/styleguide` (`src/pages/dev/StyleGuide.tsx`) and `src/components/ui/*` and `src/components/brand/*`. Reuse them, and don't hard-code colours.
3. Read `src/pages/Today.tsx` (`DailyCard`, `StreakCard`, `TargetCard`, `LevelCard`, `LeagueCard`), `src/pages/Onboarding.tsx` (`HandleStep`, `GoalStep`, `PlacementIntro`, `PlacementRunner`, `PlacementResultView`, `PlacementRetake`), `src/lib/game.ts` and `src/lib/format.ts`.

**Don't change queries, mutations or game logic.** Restyle markup and classes only.

## Today (`pages/Today.tsx`)

The Today page is the app's front door, so make it feel energetic and focused.

- **Greeting header**: "Good morning, {name}" in bold navy, with the date and track or level in muted text.
- **Daily card (hero)**: a large card in the **navy gradient** with white text. It shows the title of today's set, the question count and estimated time, a progress indicator (orange-gradient bar or segmented dots for answered, correct and wrong), and an orange pill CTA ("Start today's challenge", "Continue", or "See results" when done). Add a faint `AptricMark` or peak motif as a background watermark. Add a countdown to the next set (local midnight) if the data already exists.
- **Streak card**: a flame icon in the orange gradient, a large streak number, the best streak in muted text, and a week strip of seven dots (orange when done, outlined when missed, pulsing ring for today). Respect reduced motion.
- **Daily target card**: a circular goal ring with an orange-gradient stroke, "x / y questions" in the centre, and an encouraging line.
- **Level card**: the level badge in a navy chip, an XP bar with the orange gradient, and "N XP to level L+1".
- **League card**: the league tier name and icon (tint tiers Bronze, Silver, Gold, Platinum and Diamond with tokens), the current rank, promotion and demotion zone hints (success and danger soft colours), and a link to Compete.
- **Layout**: on phones, a single column with the Daily card first. On desktop, a two-column grid (Daily card full width on top, the other cards in a 2×2 grid, or a 2:1 split). Spacing is consistent, with 16px gutters on mobile.
- Loading, empty and error states use the shared skeleton and `states.tsx` components.

## Onboarding (`pages/Onboarding.tsx`)

- `StepFrame`: a centred column on Off White with a step indicator at the top (an orange-gradient progress bar plus "Step 2 of 3"), a big navy title, muted description, and the content in a white card.
- **HandleStep**: the username input with the `@` prefix, inline availability feedback (success and danger), and an orange "Continue" pill.
- **GoalStep**: exam goal options as **selectable cards** (icon, label, short hint). The selected card gets a 2px orange border, a soft-orange background and a check badge. The daily target uses a pill segmented control. Keyboard and radio semantics must keep working.
- **PlacementIntro**: a navy gradient card that explains "10 questions · about 10 minutes · sets your starting level", with an orange "Start placement test" pill and a "Skip for now" text link.
- **PlacementRunner**: make it consistent with the Solve screen style (session 05 restyles `SolveScreen`; if this runner uses its own markup, mirror the same option-card style: white option cards, orange selected state, keys 1–4 shown as small navy key-caps).
- **PlacementResultView**: a celebration layout with the starting level in a large navy badge, the section-wise result bars in the orange gradient, a subtle confetti burst made of brand-colour CSS shapes (disabled under reduced motion), and an orange CTA.

## Done when

- Lint, typecheck, tests and build pass.
- You have screenshots (390px and 1280px, light and dark) of Today in these states: daily not started, in progress, done, and loading. Also capture each onboarding step and the placement result. Stub API responses as needed, for example with Playwright `page.route` mocks.
- Commit ("Redesign Today dashboard and onboarding") and push.
