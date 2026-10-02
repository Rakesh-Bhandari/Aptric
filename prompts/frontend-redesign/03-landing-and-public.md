# Session 03: Landing page and public pages

You are continuing the **Aptric** frontend redesign (`frontend/`). Sessions 01 (tokens, logo, primitives) and 02 (shell, nav, auth dialog) are merged. This session builds the **marketing landing page**, which signed-out visitors see at `/`, and restyles the other public pages.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `README.md`. Study the **"Usage example"** in `brand-spec.jpg` closely. It is the hero you're building.
2. Read `frontend/src/pages/Landing.tsx`, `Terms.tsx`, `AuthCallback.tsx`, `ResetPassword.tsx`, the shell in `components/layout/AppShell.tsx`, and `context/AuthDialogContext.tsx` (`openAuth`).
3. Read the root `README.md` features list. Landing copy must describe real features only.

## Landing page (`pages/Landing.tsx`)

Build these sections, splitting them into components under `src/pages/landing/` if the file grows past about 250 lines:

1. **Hero** (full-bleed, Dark Navy to navy gradient, white text)
   - A huge, stacked, bold headline in the spec's style: **"Build. / Solve. / Grow."**, with "Grow." in the orange gradient (`bg-clip-text`). Alternatively use an aptitude-specific variant in the same rhythm, such as "Practice. / Compete. / **Get placed.**". Choose one and keep the three-beat rhythm.
   - Subcopy: "A daily aptitude platform for thinkers, builders and problem solvers. Short daily challenges, focused practice and friendly leagues, for placements, CAT, banking and more."
   - CTAs: an orange pill **"Get Started"** (`openAuth({ mode: 'signup', next: '/' })`) and a white-outline pill **"Learn More"** that smooth-scrolls to the features section. Add a small text link "I already have an account" (sign-in).
   - Right side, desktop only: the glowing **mountain-peak illustration** from the spec. Build it as an inline SVG with layered navy peaks, orange rim-light gradients on the ridges and a soft orange glow behind the summit, which echoes the "A" shape. Don't use any external image. On phones, show a smaller, cropped version below the text or hide it.
   - Add a subtle grid or dot pattern or radial glow in the background, and keep it calm.
   - Pills above the headline: "For TCS NQT • Infosys • AMCAT • CAT • GATE • Bank PO • SSC" (these are the exam tags in the README).
2. **Trust and stat strip**: three or four short stats, for example "5 sections", "10 questions a day", "Weekly leagues", and "Every answer explained". Use only claims the product supports. Don't invent user counts.
3. **Features** (Off White background): four cards (Daily challenge, Practice by topic, Leagues and contests, See your progress). Each has an icon in a soft-orange rounded square with an orange icon, a navy title and muted text. Use the hover lift and shadow from tokens.
4. **How it works**: three numbered steps (Pick your goal and take a 10-question placement test → solve your daily set → climb your league). Use orange numerals in navy circles and a connecting line on desktop.
5. **Sections showcase**: the five sections (Quantitative Aptitude, Logical Reasoning, Verbal Ability, Data Interpretation, Technical Aptitude) as chips or cards, with a few example topics each.
6. **Product preview**: a stylised, static mock of a question card with four options, one selected in orange, a timer and a streak flame. Build it from real UI primitives, not an image.
7. **Final CTA band**: navy gradient, "Start your streak today.", and an orange "Get Started" pill.
8. **Footer**: the rich variant (stacked logo, columns of links that exist, ©).

Requirements:

- It is responsive from 360px to wide desktop with no horizontal scroll, and the hero headline scales with `clamp()`.
- Add scroll-reveal fade-ups (IntersectionObserver plus CSS), disabled under reduced motion. Don't add animation libraries.
- Use real headings (`h1` once), landmarks and alt text, and make sure focus order follows the visual order.
- Update `index.html` meta: description, Open Graph and Twitter tags (title, description, and an `og:image` made from the logo on navy at 1200×630, generated into `public/brand/og.png`).
- Lighthouse-minded: no layout shift from fonts or the hero SVG, and no new heavy dependencies.

## Other public pages

- `Terms.tsx`: a readable long-form layout (max-width prose, navy headings, orange section anchors, a "Last updated" chip).
- `ResetPassword.tsx` and `AuthCallback.tsx`: a centred card on Off White with `AptricMark` above it, the same style as the auth dialog from session 02, and a branded loading state for the callback.

## Done when

- Lint, typecheck, tests and build pass.
- You have screenshots of the full landing page (390px and 1280px, light and dark, full-page), Terms and Reset Password.
- The CTAs open the correct auth dialog modes (check this in the browser).
- Commit ("Build branded landing page and public pages") and push. In your summary, say which hero headline you chose.
