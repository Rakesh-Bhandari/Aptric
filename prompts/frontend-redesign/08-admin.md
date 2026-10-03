# Session 08: Admin area

You are continuing the **Aptric** frontend re-theme (`frontend/`) from navy and orange to **navy, blue and violet**. Session 01 (tokens, logo, primitives) is merged. This session re-themes the **admin area** (`/admin/*`), which only admins can see. It must feel like a clean, dense, professional tool in the same brand, not a marketing page.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` (including "Colour roles, old → new") and `README.md`.
2. Read `src/index.css` (note the admin alias tokens `--bg`, `--card-bg`, `--text`, `--text-muted`, `--error` and `--primary-dark`, and the `--chrome*` tokens) and `/dev/styleguide`.
3. Read everything in `src/admin/`: `AdminLayout.jsx`, `AdminUi.jsx`, `Admin.css`, `ReviewQueue.jsx`, `Questions.jsx`, `QuestionPage.jsx`, `QuestionEditor.jsx`, `Users.jsx`, `UserPage.jsx`, `Reports.jsx`, `Jobs.jsx`, `AuditLog.jsx`, `adminUtils.js` and `api.js`.

**Don't change `api.js`, data handling or admin RPC calls.** Keep the current approach (`Admin.css` plus any Tailwind already used); change colours and treatments, not structure.

## Tasks

- **Layout and nav** (`AdminLayout.jsx`, `.adm-nav`): keep the **Primary Navy sidebar** (`--chrome`, `#0A2540`; dark: `#0A1020` with a border) with `AptricMark` (`onDark`) and an "Admin" label. Nav items in `--chrome-muted-foreground`; the active item gets a 3px primary-gradient left bar, a `--chrome-raised` background and white text; hover text is `#38BDF8`. Count badges (for example the review-queue size) become violet pills with white text. Keep the mobile behaviour and the `--header-h` offset.
- **Tables** (Questions, Users, Reports, Jobs, Audit log): `--background` header rows with uppercase muted labels, `--border` dividers, row hover in a faint blue tint, tabular numerals, sticky headers where tables are long. On mobile, tables scroll horizontally inside their card.
- **Status chips**: draft = muted, in review = soft blue, published = success soft, retired = danger soft or muted. Roles = Soft Purple, bans = danger. Job states: queued (muted), running (violet with a pulsing dot), done (success) and failed (danger). Keep the same meaning everywhere, legible in both themes.
- **Review queue** (`ReviewQueue.jsx`): Approve is a primary-gradient pill, "Send back" is outline, and Retire is danger. Keyed answers stay marked in success.
- **Question editor** (`QuestionEditor.jsx`): form sections in white cards, consistent inputs with the blue focus ring, the live Markdown and KaTeX preview, and the sticky save bar with a primary-gradient save pill.
- **User page, reports, jobs and audit log**: the audit timeline dots and line use blue and violet instead of orange.
- Filters and search bars: pill inputs and segmented controls from the primitives.
- Replace every remaining orange or hard-coded colour in `Admin.css` with tokens. Dark mode works throughout.

## Done when

- Lint, typecheck, tests and build pass.
- No orange remains in `src/admin/*`.
- You have screenshots (1280px and 390px, light and dark) of every admin route with mocked data.
- Commit ("Re-theme admin area") and push.
