# Session 03: Landing page and public pages

You are continuing the **Aptric** frontend re-theme (`frontend/`) from navy and orange to **navy, blue and violet**. Sessions 01 (tokens, logo, primitives) and 02 (shell, nav, auth dialog) are merged. This session re-themes the **marketing landing page**, which signed-out visitors see at `/`, and the other public pages.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `README.md`. Study both **"Usage example"** panels in `brand-spec.jpg` closely. They are the hero you're building, in light and in dark.
2. Read `frontend/src/pages/Landing.tsx`, everything in `frontend/src/pages/landing/` (`Hero.tsx`, `HeroMountain.tsx`, `Sections.tsx`, `ProductPreview.tsx` and the rest), `Terms.tsx`, `AuthCallback.tsx`, `ResetPassword.tsx`, the shell in `components/layout/AppShell.tsx`, and `context/AuthDialogContext.tsx` (`openAuth`).
3. Read the root `README.md` features list. Landing copy must describe real features only.

The page structure already exists. Keep the sections and their components; change what's listed below.

## Landing page

1. **Hero** (the biggest change)
   - **Light theme**: the hero is no longer navy. Use `--gradient-hero`: `#F8FAFC` fading into a soft lavender and pale-blue mist, with soft white cloud shapes low on the right. The headline is navy (`#0A2540` or `#0F172A`).
   - **Dark theme**: a midnight background (`#0A1020` into `#111A33`) with soft blue and violet glows, white headline.
   - Headline: **"Practice. / Compete. / Grow."**, huge and stacked, with "Grow." in `text-gradient-brand` (primary gradient in light, `#38BDF8` → `#A78BFA` in dark). Keep the `clamp()` sizing.
   - Subcopy: "A platform for thinkers, builders and problem solvers." plus one short line on what Aptric is (daily aptitude challenges, focused practice and friendly leagues, for placements, CAT, banking and more).
   - CTAs: a primary-gradient pill **"Get Started →"** (`openAuth({ mode: 'signup', next: '/' })`) and an outline pill **"Learn More"** (light: blue border and text; dark: white border and text) that smooth-scrolls to the features section. Keep the small "I already have an account" link.
   - Right side, desktop: redraw **`HeroMountain.tsx`** to match the spec: layered blue and violet peaks (lighter, misty blue-lavender peaks with a pine-tree treeline in light mode; deep navy, blue and violet peaks with a dark treeline in dark mode), a **glowing light-blue (`#38BDF8`) winding path** climbing to the summit with a soft glow, and a small **violet flag** on the peak. Inline SVG only, no external images. Use theme tokens or CSS variables so one SVG serves both themes. On phones, show a smaller, cropped version below the text or hide it.
   - Keep the exam-tag pills above the headline ("For TCS NQT • Infosys • AMCAT • CAT • GATE • Bank PO • SSC"), restyled as Soft Purple chips (dark: violet tint).
2. **Trust and stat strip**: the same claims; numbers in heading ink with a small blue icon.
3. **Features** (`--background`): the four cards keep their content. Icon tiles become soft-blue or Soft Purple rounded squares with a blue or violet icon (alternate them, don't add a rainbow); hover lift and shadow from tokens.
4. **How it works**: three numbered steps. Numerals white on primary-gradient circles; the connecting line on desktop uses the secondary gradient.
5. **Sections showcase**: the five sections as chips or cards with example topics, in blue and violet soft tints.
6. **Product preview**: the static question-card mock, with the selected option in the new selected style (2px blue border, soft-blue background, blue key-cap), a timer and a streak flame.
7. **Final CTA band**: a navy gradient panel with a violet glow, "Start your streak today.", and a primary-gradient "Get Started →" pill.
8. **Footer**: the rich variant from session 02.

Requirements:

- It is responsive from 360px to wide desktop with no horizontal scroll.
- Keep the scroll-reveal fade-ups (disabled under reduced motion). Don't add animation libraries.
- Keep the headings, landmarks, alt text and focus order.
- Regenerate `public/brand/og.png` (1200×630) with the new logo and "Practice. Compete. Grow." on the navy gradient with blue and violet glows. Update `index.html` meta (description, Open Graph and Twitter tags) if any copy changed.
- No layout shift from fonts or the hero SVG, and no new heavy dependencies.

## Other public pages

- `Terms.tsx`: a readable long-form layout (max-width prose, heading-ink headings, blue section anchors, a Soft Purple "Last updated" chip).
- `ResetPassword.tsx` and `AuthCallback.tsx`: a centred card on `--background` with `AptricMark` above it, the same style as the auth dialog from session 02, and a branded loading state for the callback.

## Done when

- Lint, typecheck, tests and build pass.
- No orange remains in `pages/Landing.tsx`, `pages/landing/*`, `Terms.tsx`, `ResetPassword.tsx` or `AuthCallback.tsx`.
- You have screenshots of the full landing page (390px and 1280px, light and dark, full-page) placed next to the spec's usage examples, plus Terms and Reset Password.
- The CTAs open the correct auth dialog modes (check this in the browser).
- Commit ("Re-theme landing page and public pages") and push.
