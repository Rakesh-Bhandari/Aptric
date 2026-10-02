# Session 08: Admin area

You are continuing the **Aptric** frontend redesign (`frontend/`). Session 01 (tokens, logo, primitives) is merged. This session restyles the **admin area** (`/admin/*`), which only admins can see. It must feel like a clean, dense, professional tool in the same brand, not a marketing page.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `README.md`.
2. Read `src/index.css` (note the admin alias tokens `--bg`, `--card-bg`, `--text`, `--text-muted`, `--error` and `--primary-dark`) and `/dev/styleguide`.
3. Read everything in `src/admin/`: `AdminLayout.jsx`, `AdminUi.jsx`, `Admin.css`, `ReviewQueue.jsx`, `Questions.jsx`, `QuestionPage.jsx`, `QuestionEditor.jsx`, `Users.jsx`, `UserPage.jsx`, `Reports.jsx`, `Jobs.jsx`, `AuditLog.jsx`, `adminUtils.js` and `api.js`.

**Don't change `api.js`, data handling or admin RPC calls.** The area is plain JSX plus `Admin.css`. You may keep it that way (restyle the CSS) or move parts to Tailwind classes and the shared `components/ui` primitives. Choose whichever is less risky, and stay consistent.

## Tasks

- **Layout and nav** (`AdminLayout.jsx`, `.adm-nav`): a **Dark Navy sidebar** with the `AptricMark` and an "Admin" label, nav items in light navy text, the active item with an orange left bar and a lighter navy background, and count badges (for example the review-queue size, if it's already fetched) as orange pills. On mobile, the sidebar collapses to a horizontal scrollable pill bar or a drawer. Fix the hard-coded `calc(100vh - 75px)` so it matches the new header height from session 02 (use a CSS variable).
- **Tables** (Questions, Users, Reports, Jobs, Audit log): Off White header rows with uppercase muted labels, Border dividers, row hover in muted navy, tabular numerals, and sticky headers where tables are long. On mobile, tables scroll horizontally inside their card.
- **Status chips**: draft = muted, in review = soft orange, published = success soft, retired = danger soft or muted. Roles and bans use navy soft and danger. Job states queued, running (orange, pulsing dot), done and failed. Keep the same meaning everywhere, and keep it legible in both themes.
- **Review queue** (`ReviewQueue.jsx`): a focused card per question with the meta chips, stem, options with the keyed answer marked (success), explanation, and verification notes. Approve is an orange pill, "Send back" is outline, and Retire is danger. Show keyboard hints if any exist.
- **Question editor** (`QuestionEditor.jsx`): grouped form sections in white cards, consistent inputs, a live Markdown and KaTeX preview pane (desktop: side by side; mobile: stacked or tabbed) using the same `Markdown` component as learners, and a sticky save bar.
- **User page, reports, jobs and audit log**: consistent cards, definition lists and timeline styling for the audit entries (a navy dot timeline).
- Filters and search bars: pill inputs and segmented controls from the primitives.
- Dark mode works throughout. Replace any hard-coded colours in `Admin.css` with tokens.

## Done when

- Lint, typecheck, tests and build pass.
- You have screenshots (1280px and 390px, light and dark) of every admin route with mocked data.
- Commit ("Redesign admin area") and push.
