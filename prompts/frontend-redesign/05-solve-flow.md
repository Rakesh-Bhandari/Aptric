# Session 05: Solve flow (questions, answers, summary)

You are continuing the **Aptric** frontend redesign (`frontend/`). Session 01 (tokens, logo, primitives) is merged. This session restyles the **core experience**: answering questions. It must be the most polished, distraction-free and fastest screen in the app, and it is used mostly on phones.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `README.md`.
2. Read `src/components/ui/*`, `src/components/brand/*` and `/dev/styleguide`.
3. Read `src/components/solve/*` (`SolveScreen.tsx`, `SessionHeader.tsx`, `ReportDialog.tsx`, `session.ts`, `SolveScreen.test.tsx`), `src/pages/solve/*` (`DailySolve`, `PracticeSolve`, `AnswerNews`, `news.ts`, `SolveSkeleton`), `src/pages/SessionSummary.tsx`, `src/components/markdown/Markdown.tsx`, and `src/hooks/useSolveKeys.ts` and `useElapsed.ts`.

**Don't change the grading, hint, give-up or timer logic, or the keyboard shortcuts.** `SolveScreen.test.tsx` must pass. Update its selectors only if the markup changes, and keep the role- and label-based queries.

## Tasks

### Session header (`SessionHeader.tsx`)

A slim bar with a close (×) button, a **segmented progress bar** (one segment per question: orange-gradient fill for the current or answered one, success and danger tints for correct and wrong after reveal, muted for pending), "3 / 10", and the timer in tabular numerals with a clock icon. It sticks to the top.

### Question (`SolveScreen.tsx`)

- **Meta row**: section › topic in muted text, a difficulty chip (easy = success soft, medium = soft orange, hard = danger soft), and a "Daily", "Practice", "Contest" or "Placement" kind chip.
- **Stem**: in a white card, with comfortable reading size (17–18px on mobile), navy text and generous line-height. Markdown, tables and KaTeX must look good (see below).
- **Options**: four large tappable cards (at least 56px tall, full width), each with a navy **key-cap** (1–4, or A–D) at left.
  - Hover: a light navy border.
  - Selected (before submit): a 2px orange border, a soft-orange background and an orange key-cap.
  - Correct after reveal: a success border and soft background with a check icon. Wrong pick: danger with a cross. Don't fade the correct answer.
  - Disabled after the attempt. Use a short, smooth transition (respect reduced motion).
- **Actions**: a sticky bottom action bar on mobile (white with a top shadow, safe-area padding) holding the primary orange **"Check answer"** (then "Next" or "Finish") pill, a **Hint** button showing its cost (coin or XP chip), and an overflow for "Give up & see answer" and "Report a problem".
- **Feedback and explanation**: after answering, an inline banner (success: "Correct! +XP" with a small pop animation; danger: "Not quite"), then an **Explanation** card with a navy left accent and the Markdown and KaTeX explanation. `AnswerNews` items (XP gained, level up, streak extended) appear as small toasts or chips in brand colours.
- Show keyboard hints on desktop only (`1–4 to choose · Enter to check`) as small key-caps.

### Markdown and KaTeX (`Markdown.tsx` and CSS)

Style the prose: navy headings, `accent-text` links, inline code on a muted background, tables with Border lines and Off White header rows (horizontal scroll inside the card on mobile, never on the page), and readable KaTeX in both themes (inherit the colour). Long formulas scroll horizontally inside their own box.

### Report dialog (`ReportDialog.tsx`)

Use the new dialog styling, reasons as selectable pill chips, a textarea, an orange submit button and a ghost cancel button.

### Session summary (`pages/SessionSummary.tsx`)

- **Hero**: a navy gradient card with the score as a big number ("8 / 10") inside a ring with an orange-gradient stroke, accuracy %, time taken, and XP earned (an orange chip). For a perfect score, show a small celebratory burst (CSS only, reduced-motion aware).
- **Outcome row**: per-question squares (correct, wrong, gave up, skipped) using the tokens and keeping the icons, so the meaning doesn't rely on colour alone.
- **Share**: the existing share text, with a "Share result" button (Web Share API fallback as already implemented) styled as an outline pill.
- **Streak and league updates**: compact cards. Next actions: an orange "Practice weak areas" pill and an outline "Back to Today" pill.
- **Review list**: an expandable list of each question with your answer, the correct answer and the explanation.

### Skeleton

`SolveSkeleton.tsx` matches the new layout (header bar, stem block, four option blocks).

## Done when

- Lint, typecheck, tests (including `SolveScreen.test.tsx`) and build pass.
- You have screenshots (390px and 1280px, light and dark) of: an unanswered question, the selected state, correct and wrong reveals with the explanation, a question with a KaTeX formula and a table, the report dialog, and the session summary (normal and perfect score). Mock the API.
- Keyboard flow checked in the browser: `1`–`4`, then `Enter`, then `Enter` for next.
- Commit ("Redesign solve flow and session summary") and push.
