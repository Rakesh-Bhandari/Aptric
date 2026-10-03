# Session 04: Today dashboard and onboarding

You are continuing the **Aptric** frontend re-theme (`frontend/`) from navy and orange to **navy, blue and violet**. Sessions 01 (tokens, logo, primitives) and 02 (shell) are merged. This session re-themes the **signed-in home** (`/`, Today) and the **onboarding and placement flow**.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` (including "Colour roles, old → new") and `README.md`, and look at `brand-spec.jpg`.
2. Read `/dev/styleguide` (`src/pages/dev/StyleGuide.tsx`) and `src/components/ui/*` and `src/components/brand/*`. Reuse them, and don't hard-code colours.
3. Read `src/pages/Today.tsx` (`DailyCard`, `StreakCard`, `TargetCard`, `LevelCard`, `LeagueCard`), `src/pages/Onboarding.tsx` (`HandleStep`, `GoalStep`, `PlacementIntro`, `PlacementRunner`, `PlacementResultView`, `PlacementRetake`), `src/lib/game.ts` and `src/lib/format.ts`.

**Don't change queries, mutations or game logic.** Restyle markup and classes only. Keep the layouts unless something below says otherwise.

## Today (`pages/Today.tsx`)

The Today page is the app's front door, so make it feel energetic and focused.

- **Greeting header**: "Good morning, {name}" in bold heading ink, with the date and track or level in muted text.
- **Daily card (hero)**: a large card in the **navy gradient** with a soft violet glow in one corner and white text. It shows the title of today's set, the question count and estimated time, a progress indicator (primary-gradient bar, or segmented dots for answered, correct and wrong), and a primary-gradient pill CTA with white text ("Start today's challenge →", "Continue", or "See results" when done). Keep the faint `AptricMark` or peak watermark (now in blue and violet). Light-blue (`#38BDF8`) for small icons and secondary text accents on the navy.
- **Streak card**: the flame icon keeps its warm `--streak` colour (it's semantic), a large streak number, the best streak in muted text, and a week strip of seven dots (primary gradient when done, outlined when missed, a pulsing blue ring for today). Respect reduced motion.
- **Daily target card**: a circular goal ring with a primary-gradient stroke, "x / y questions" in the centre, and an encouraging line.
- **Level card**: the level badge in a violet chip (Soft Purple background, `#5B21B6` text), an XP bar with the primary gradient, and "N XP to level L+1".
- **League card**: the league tier name and icon (tier tokens), the current rank, promotion and demotion zone hints (success and danger soft colours), and a link to Compete.
- Loading, empty and error states use the shared skeleton and `states.tsx` components.

## Onboarding (`pages/Onboarding.tsx`)

- `StepFrame`: a centred column on `--background` with a step indicator at the top (a primary-gradient progress bar plus "Step 2 of 3"), a big heading, muted description, and the content in a white card.
- **HandleStep**: the username input with the `@` prefix, inline availability feedback (success and danger), and a primary-gradient "Continue" pill.
- **GoalStep**: exam goal options as **selectable cards** (icon, label, short hint). The selected card gets a 2px blue (`#2563EB`) border, a soft-blue (`#E0E7FF`, dark: blue tint) background and a check badge in the primary gradient. The daily target uses the pill segmented control. Keyboard and radio semantics must keep working.
- **PlacementIntro**: a navy gradient card that explains "10 questions · about 10 minutes · sets your starting level", with a primary-gradient "Start placement test →" pill and a "Skip for now" text link in `#38BDF8`.
- **PlacementRunner**: consistent with the Solve screen style from session 05: white option cards, blue selected state, keys 1–4 as small navy key-caps.
- **PlacementResultView**: a celebration layout with the starting level in a large violet badge, the section-wise result bars in the primary gradient, a subtle confetti burst made of blue, violet and light-blue CSS shapes (disabled under reduced motion), and a primary-gradient CTA.

## Done when

- Lint, typecheck, tests and build pass.
- No orange remains in `Today.tsx` or `Onboarding.tsx` (the streak flame's `--streak` token is allowed).
- You have screenshots (390px and 1280px, light and dark) of Today in these states: daily not started, in progress, done, and loading. Also capture each onboarding step and the placement result. Stub API responses as needed, for example with Playwright `page.route` mocks.
- Commit ("Re-theme Today dashboard and onboarding") and push.
