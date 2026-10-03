# Session 06: Practice and Progress

You are continuing the **Aptric** frontend re-theme (`frontend/`) from navy and orange to **navy, blue and violet**. Sessions 01 (tokens, logo, primitives) and 02 (shell) are merged. This session re-themes **Practice** (`/practice`) and **Progress** (`/progress`), including the charts.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` (including "Colour roles, old → new") and `README.md`.
2. Read `src/components/ui/*`, `src/components/brand/*` and `/dev/styleguide`.
3. Read `src/pages/Practice.tsx`, `src/pages/Progress.tsx` (`Overview`, `HistoryTab`, `MistakesTab`, `MistakeItem`), `src/components/charts/SkillRadar.tsx` and `ActivityHeatmap.tsx`, `src/components/ui/stars.tsx`, and `src/lib/routes.ts` (`practiceHref`).

Restyle only. Don't change queries, filters or URL parameters.

## Practice (`pages/Practice.tsx`)

- **Header**: the page title and subtitle, the pill **search** input with a search icon, the **difficulty preference** as the segmented pill control (Any, Easy, Medium, Hard), and the **"Weak areas"** card: a Soft Purple card (`variant="soft"`; dark: violet tint) with a violet target icon and a primary-gradient CTA.
- **Sections**: the five sections as cards, each with an icon tile in blue or violet soft tints (alternate them; don't add a rainbow), the section name, overall mastery (stars plus a thin primary-gradient bar), and question counts if they're already available.
- **Topics and subtopics** (accordion): the topic row shows its name, mastery stars and a chevron. Subtopic rows are compact with stars and a small "Practice" pill (secondary style) that links to `practiceHref`. If the page supports multi-select, the sticky bottom bar uses a primary-gradient pill ("Practice 3 subtopics →").
- **Empty search state**: friendly text.
- Mobile: the accordion has full-width rows that are at least 48px tall.

## Progress (`pages/Progress.tsx`)

- **Tabs** (Overview, History, Mistakes): the pill segmented tabs from session 01.
- **Overview**:
  - KPI tiles: each with a big heading-ink number, a muted label and a small icon in a blue or violet soft tile. On mobile, a 2-column grid. On desktop, 4 columns.
  - **Skill radar** (`SkillRadar.tsx`): the grid in `--border`, the axis labels in muted text, and the data polygon with a `--chart-accent` (`#2563EB`; dark `#60A5FA`) stroke and a low-opacity violet or secondary-gradient fill. Keep the accessible values.
  - **Activity heatmap** (`ActivityHeatmap.tsx`): a 5-step **blue → violet scale** from `--muted` (none) through `--heat-1`..`--heat-4` (most), rounded cells, month and day labels in muted text, the legend ("Less ▢▢▢▢▢ More"), and a `title` per cell. Use the dark-mode heat tokens from session 01 and check adjacent steps are distinguishable on `#111A33`. On mobile it scrolls horizontally inside its card, starting at the latest week.
  - Recent daily sets: a compact list with the date, a score chip and a link.
- **History tab**: rows or cards per session with the date, kind chip (Soft Purple), score, a primary-gradient accuracy bar and time.
- **Mistakes tab** (`MistakeItem`): an expandable card with the stem preview, "Your answer" (danger soft) and "Correct" (success soft) rows, the explanation (Markdown), and a "Practice this subtopic" outline pill.

Read the `dataviz` skill (if available in your session) before you restyle the charts, and make sure the chart colours pass 3:1 against the card background in both themes.

## Done when

- Lint, typecheck, tests and build pass.
- No orange remains in `Practice.tsx`, `Progress.tsx` or `components/charts/*`.
- You have screenshots (390px and 1280px, light and dark) of Practice (default, searching, weak-areas card, an expanded topic) and of each Progress tab with realistic mocked data, including a full heatmap.
- Commit ("Re-theme Practice and Progress pages") and push.
