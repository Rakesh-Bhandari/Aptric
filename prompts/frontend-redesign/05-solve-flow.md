# Session 05: Solve flow (questions, answers, Tutor, summary)

You are continuing the **Aptric** frontend re-theme (`frontend/`) from navy and orange to **navy, blue and violet**. Session 01 (tokens, logo, primitives) is merged. This session re-themes the **core experience**: answering questions. It must be the most polished, distraction-free and fastest screen in the app, and it is used mostly on phones.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` (including "Colour roles, old → new") and `README.md`.
2. Read `src/components/ui/*`, `src/components/brand/*` and `/dev/styleguide`.
3. Read `src/components/solve/*` (`SolveScreen.tsx`, `SessionHeader.tsx`, `AskTutor.tsx`, `TutorPanel.tsx`, `ReportDialog.tsx`, `session.ts`, and the tests), `src/pages/solve/*` (`DailySolve`, `PracticeSolve`, `AnswerNews`, `news.ts`, `SolveSkeleton`), `src/pages/SessionSummary.tsx`, `src/components/markdown/Markdown.tsx`, and `src/hooks/useSolveKeys.ts` and `useElapsed.ts`.

**Don't change the grading, Tutor, timer, copy-protection or tab-switch logic, or the keyboard shortcuts.** `SolveScreen.test.tsx` and `TutorPanel.test.tsx` must pass. Update their selectors only if the markup changes, and keep the role- and label-based queries.

## Tasks

### Session header (`SessionHeader.tsx`)

A slim bar with a close (×) button, a **segmented progress bar** (one segment per question: primary-gradient fill for the current or answered one, success and danger tints for correct and wrong after reveal, muted for pending), "3 / 10", and the timer in tabular numerals with a clock icon. It sticks to the top.

### Question (`SolveScreen.tsx`)

- **Meta row**: section › topic in muted text, a difficulty chip (easy = success soft, medium = soft blue, hard = danger soft), and a "Daily", "Practice", "Contest" or "Placement" kind chip in Soft Purple.
- **Stem**: in a white card (dark: `#111A33`), 17–18px on mobile, Text Primary ink and generous line-height.
- **Options**: four large tappable cards (at least 56px tall, full width), each with a navy **key-cap** (1–4, or A–D) at left.
  - Hover: a light blue border (`#93C5FD`; dark: `#38BDF8` at low opacity).
  - Selected (before submit): a 2px `#2563EB` border, a soft-blue background and a key-cap in the primary gradient with white text.
  - Correct after reveal: a success border and soft background with a check icon. Wrong pick: danger with a cross. Don't fade the correct answer.
  - Disabled after the attempt. Use a short, smooth transition (respect reduced motion).
- **Actions**: the sticky bottom action bar on mobile (white with a top shadow, safe-area padding) holding the primary-gradient **"Check answer"** (then "Next →" or "Finish") pill, the **Ask Tutor** entry point (`AskTutor.tsx`) as a secondary or outline pill with a violet sparkle or chat icon, and the overflow for "Report a problem".
- **Feedback and explanation**: after answering, an inline banner (success: "Correct! +XP" with a small pop animation; danger: "Not quite"), then an **Explanation** card with a 3px primary-gradient left accent and the Markdown and KaTeX explanation. `AnswerNews` items (XP gained, level up, streak extended) appear as small chips: XP in blue, level up in violet, streak with the flame.
- Show keyboard hints on desktop only (`1–4 to choose · Enter to check`) as small key-caps.

### Tutor (`TutorPanel.tsx`, `AskTutor.tsx`)

The chat panel: a header with a small `AptricMark` and "Aptric Tutor", learner messages as primary-gradient bubbles with white text (right), Tutor messages as white or `#111A33` cards with a `--border` (left) rendered with the shared `Markdown`, a typing indicator in blue and violet dots (reduced-motion aware), and an input with a primary-gradient send button. The launcher icon uses the secondary gradient or violet.

### Markdown and KaTeX (`Markdown.tsx` and CSS)

Style the prose: heading-ink headings, `accent-text` links, inline code on a muted background, tables with `--border` lines and `--background` header rows (horizontal scroll inside the card on mobile, never on the page), and readable KaTeX in both themes (inherit the colour). Long formulas scroll horizontally inside their own box.

### Report dialog (`ReportDialog.tsx`)

The new dialog styling, reasons as selectable pill chips (selected = soft blue with a blue border), a textarea, a primary-gradient submit button and a ghost cancel button.

### Session summary (`pages/SessionSummary.tsx`)

- **Hero**: a navy gradient card with a violet glow, the score as a big number ("8 / 10") inside a ring with a primary-gradient stroke (on navy, use the `#38BDF8` → `#A78BFA` gradient so it stays visible), accuracy %, time taken, and XP earned (a light-blue chip). For a perfect score, show a small celebratory burst in blue, violet and light blue (CSS only, reduced-motion aware).
- **Outcome row**: per-question squares (correct, wrong, gave up, skipped) using the tokens and keeping the icons, so the meaning doesn't rely on colour alone.
- **Share**: the existing "Share result" button as an outline pill.
- **Streak and league updates**: compact cards. Next actions: a primary-gradient "Practice weak areas →" pill and an outline "Back to Today" pill.
- **Review list**: the expandable list of each question with your answer, the correct answer, the explanation and the Tutor entry point.

### Skeleton

`SolveSkeleton.tsx` matches the layout with the new slate shimmer.

## Done when

- Lint, typecheck, tests (including `SolveScreen.test.tsx` and `TutorPanel.test.tsx`) and build pass.
- No orange remains in `components/solve/*`, `pages/solve/*`, `SessionSummary.tsx` or `Markdown.tsx`.
- You have screenshots (390px and 1280px, light and dark) of: an unanswered question, the selected state, correct and wrong reveals with the explanation, the Tutor panel with a short conversation, a question with a KaTeX formula and a table, the report dialog, and the session summary (normal and perfect score). Mock the API.
- Keyboard flow checked in the browser: `1`–`4`, then `Enter`, then `Enter` for next.
- Commit ("Re-theme solve flow, Tutor and session summary") and push.
