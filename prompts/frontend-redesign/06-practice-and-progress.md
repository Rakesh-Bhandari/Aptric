# Session 06: Practice and Progress

You are continuing the **Aptric** frontend redesign (`frontend/`). Sessions 01 (tokens, logo, primitives) and 02 (shell) are merged. This session restyles **Practice** (`/practice`) and **Progress** (`/progress`), including the charts.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `README.md`.
2. Read `src/components/ui/*`, `src/components/brand/*` and `/dev/styleguide`.
3. Read `src/pages/Practice.tsx`, `src/pages/Progress.tsx` (`Overview`, `HistoryTab`, `MistakesTab`, `MistakeItem`), `src/components/charts/SkillRadar.tsx` and `ActivityHeatmap.tsx`, `src/components/ui/stars.tsx`, and `src/lib/routes.ts` (`practiceHref`).

Restyle only. Don't change queries, filters or URL parameters.

## Practice (`pages/Practice.tsx`)

- **Header**: the page title and subtitle, then a **search** input with a search icon in a pill shape, the **difficulty preference** as a segmented pill control (Any, Easy, Medium, Hard), and a prominent **"Weak areas"** card or button (soft-orange card with a target icon and an orange CTA) that starts weak-areas mode.
- **Sections**: the five sections as cards, each with a coloured icon tile (use navy and orange tints; don't add a rainbow), the section name, overall mastery (stars plus a thin orange-gradient bar), and question counts if they're already available.
- **Topics and subtopics** (accordion): clear hierarchy. The topic row shows its name, mastery stars and a chevron. Subtopic rows are compact with stars and a small "Practice" pill that links to `practiceHref`. Allow multi-select of subtopics with a sticky bottom bar ("Practice 3 subtopics →", orange pill) if the page already supports multi-select. Otherwise keep the current behaviour.
- **Empty search state**: friendly text, and keep the existing illustration or skip it.
- Mobile: the accordion has full-width rows that are at least 48px tall.

## Progress (`pages/Progress.tsx`)

- **Tabs** (Overview, History, Mistakes): the pill segmented tabs from session 01.
- **Overview**:
  - KPI tiles: questions solved, accuracy, best streak, current level and rating (whatever exists). Each tile has a big navy number, a muted label and a small trend or icon. On mobile, a 2-column grid. On desktop, 4 columns.
  - **Skill radar** (`SkillRadar.tsx`): the grid in Border colour, the axis labels in muted text, and the data polygon with an orange stroke and soft-orange fill (dark mode: `#FF9A3D` with a low-opacity fill). Show values in an accessible table or `<title>`s if they're missing.
  - **Activity heatmap** (`ActivityHeatmap.tsx`): a 5-step **orange scale** from `--muted` (none) to `#FF7800` (most), rounded cells, month and day labels in muted text, a legend ("Less ▢▢▢▢▢ More"), and a tooltip or `title` per cell. It needs a dark-mode scale too. On mobile it scrolls horizontally inside its card, starting at the latest week.
  - Recent daily sets: a compact list with the date, a score chip and a link.
- **History tab**: rows or cards per session with the date, kind chip, score, accuracy bar and time.
- **Mistakes tab** (`MistakeItem`): an expandable card with the question stem preview, "Your answer" (danger soft) and "Correct" (success soft) rows, the explanation (Markdown), and a "Practice this subtopic" outline pill.

Read the `dataviz` skill (if available in your session) before you restyle the charts, and make sure the chart colours pass contrast against the card background in both themes.

## Done when

- Lint, typecheck, tests and build pass.
- You have screenshots (390px and 1280px, light and dark) of Practice (default, searching, weak-areas card, an expanded topic) and of each Progress tab with realistic mocked data, including a full heatmap.
- Commit ("Redesign Practice and Progress pages") and push.
