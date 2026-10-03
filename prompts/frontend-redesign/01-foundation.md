# Session 01: Brand foundation (tokens, logo, UI primitives)

You are re-theming the frontend of **Aptric**, a React 19 + TypeScript + Vite + Tailwind CSS v4 + Radix UI app in `frontend/`, so that it matches the new brand: **navy, blue and violet** with blue → violet gradients. The app currently uses a navy and orange brand from an earlier redesign. This is the **first of nine sessions**. It replaces the foundation that every later session reuses, so get the tokens and primitives right. **Don't restyle individual pages in this session**, beyond the mechanical renames in task 2: they should simply pick up the new tokens.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `prompts/frontend-redesign/README.md` (shared rules).
2. Open `prompts/frontend-redesign/brand-spec.jpg`, `frontend/public/brand/aptric-logo-wordmark.jpg` and `frontend/public/brand/aptric-mark.jpg` with the Read tool.
3. Read `frontend/src/index.css`, `frontend/src/test/contrast.test.ts`, `frontend/index.html`, `frontend/src/components/layout/Logo.tsx`, everything in `frontend/src/components/brand/` and `frontend/src/components/ui/`, and `frontend/src/pages/dev/StyleGuide.tsx`.

## Tasks

### 1. Colour tokens (`frontend/src/index.css`)

Replace the navy and orange values with the new palette. **Keep the semantic token names** (`--primary`, `--primary-soft`, `--accent-text`, `--chrome`, `--heading`, the status, tier, metal, heat and preview tokens, and the admin aliases `--bg`, `--card-bg` and so on): pages, `Admin.css` and the contrast test depend on them. Light theme:

- `--background` `#F8FAFC`; `--card` `#FFFFFF`; `--foreground` and `--card-foreground` `#0F172A`; `--heading` `#0A2540` (or `#0F172A` if you prefer one ink, but say which).
- `--muted` `#F1F5F9` or `#E2E8F0`; `--muted-foreground` `#475569` (must pass AA on `--background`, `--card` and `--muted`); `--border` `#E2E8F0`; `--input` slightly darker (around `#CBD5E1`).
- `--primary` **`#2563EB`**, `--primary-strong` `#1D4ED8`, `--primary-foreground` **`#FFFFFF`**, `--primary-soft` `#E0E7FF`, `--primary-soft-foreground` `#1D4ED8`.
- **New** `--violet` `#7C3AED`, `--violet-strong` `#6D28D9`, `--violet-foreground` `#FFFFFF`, `--violet-soft` `#EDE9FE`, `--violet-soft-foreground` `#5B21B6`.
- **New** `--sky` `#38BDF8` (Light Blue; for icons, glows and links on navy and dark surfaces only).
- `--navy` `#0A2540`, `--navy-strong` `#071A2F`, `--navy-foreground` `#FFFFFF`, `--navy-soft` a light slate-blue tint, `--navy-soft-foreground` `#0A2540`, `--navy-muted-foreground` around `#B6C2D6`. `--brand-navy` `#0A1633` (the wordmark ink).
- `--accent-text` `#2563EB` (`#1D4ED8` wherever it sits on `--muted`).
- `--ring` `#2563EB` in light mode and `#38BDF8` in dark mode. Check that it's visible on navy surfaces too (add a `--ring-on-navy` `#38BDF8` if you need one).
- **Chrome**: the header is no longer navy in light mode (see BRAND.md, "Light mode surfaces"). Split the old `--chrome*` tokens into `--header`, `--header-foreground` and `--header-muted-foreground` (white or translucent white with navy text in light mode; `#0A1020` or `#0B1226` with light text in dark mode), and keep `--chrome`, `--chrome-deep`, `--chrome-foreground`, `--chrome-muted-foreground` and `--chrome-raised` as the **navy** surfaces (footer, auth banner, admin sidebar). `--chrome-accent` becomes `#38BDF8`.
- Gradients: `--gradient-primary` `linear-gradient(90deg, #2563EB, #7C3AED)`, `--gradient-primary-hover` `#1D4ED8` → `#6D28D9`, `--gradient-secondary` `#38BDF8` → `#7C3AED`, `--gradient-navy` `#0A2540` → `#1E3A8A`, and `--gradient-hero` (the light hero: `#F8FAFC` into a soft lavender `#EDE9FE` and pale blue `#E0F2FE` mist; dark: midnight `#0A1020` into `#111A33` with violet and blue glows). Add `--gradient-text` (light: the primary gradient; dark: `#38BDF8` → `#A78BFA`).
- `--streak` stays a warm flame colour (it's semantic, like gold), but keep it to the flame icon. `--gold`, success, danger and warning keep their meaning; re-tune them to sit well beside blue and violet.
- Charts: `--chart-accent` `#2563EB` (dark `#60A5FA`), and the heat scale `--heat-1`..`--heat-4` from pale blue to violet (for example `#DBEAFE`, `#93C5FD`, `#6366F1`, `#7C3AED`), with a dark-mode scale that stays distinguishable on `#111A33`.
- Tiers, metals, medals and the theme-picker preview swatches: re-check them against the new surfaces, and update the preview swatches to the new light and dark palettes.
- Shadows: re-tint `--shadow-sm`, `--shadow-md`, `--shadow-lg` and `--shadow-top` to slate (`rgb(15 23 42 / …)`), and add `--shadow-glow` (`0 8px 20px rgb(37 99 235 / .25)`) for primary buttons.
- `--mark-*` tokens: replace them with whatever the new `AptricMark` needs (see task 3).
- **Dark theme** (`[data-theme='dark']`): use the palette in BRAND.md ("Dark mode").
- Update the comment block at the top of `index.css` to describe the new brand and the AA rules.
- Update `index.html` `theme-color` (`#F8FAFC` light, `#0A1020` dark, with `media` queries).

Update `contrast.test.ts`: keep every existing pair, update expected values, and add the new pairs (`primary-foreground` on `primary` and `primary-strong`, white on `violet` and `violet-strong`, `violet-soft-foreground` on `violet-soft`, `primary-soft-foreground` on `primary-soft`, `header-foreground` and `header-muted-foreground` on `header`, `sky` on `navy`, `accent-text` on `card` and `background`). The primary button now carries **white** text again, so update the "status fills" check for `primary`. Every pair must pass.

### 2. Rename the orange-named tokens and utilities

Search `frontend/src` and `frontend/index.html` for orange names and rename them, updating every usage (a mechanical find and replace; don't restyle pages):

- `--orange-light` / `text-orange-light` / `bg-orange-light` → `--sky` / `text-sky` / `bg-sky`
- `bg-gradient-orange` → `bg-gradient-primary`; `text-gradient-orange` → `text-gradient-brand` (it uses `--gradient-text`, so it now works on light surfaces too)
- `--gradient-orange` → `--gradient-primary`
- Add `bg-gradient-secondary` and `bg-gradient-primary-hover` utilities.
- Expose the new colours through `@theme inline` so classes such as `bg-violet`, `bg-violet-soft`, `text-violet-soft-foreground`, `text-sky`, `bg-header` and `text-header-foreground` work.

Then grep for raw `#ff7800`, `#ff9a3d`, `#e86600`, `#d95f00`, `#c2410c`, `#fff1e6`, `#9a3412` and the word `orange` in `src/` (including comments and `Admin.css`) and list what's left for the page sessions in your summary.

### 3. Logo components (redraw)

Redraw the components in `frontend/src/components/brand/` for the **new** logo. Read the current files first and keep their props and exports.

- `AptricMark.tsx`: an inline **SVG recreation of the new ribbon "A"** from `aptric-mark.jpg`: the navy-blue left leg with its darker diagonal shadow, the cyan → electric-blue right leg folding over the apex, and the light-blue → blue → violet crossbar wave that sweeps from the left foot to the rounded right foot. Use `<linearGradient>`s with unique ids (`useId`). Props stay the same (`className`, `title`, `variant?: 'default' | 'onDark'`). In `onDark` contexts, lift the left leg (for example a brighter `#1E40AF` → `#1D3A9E`) so it doesn't disappear into navy, and check it on `#0A1020` and `#0A2540`.
- `AptricWordmark.tsx`: "APTRIC" in `#0A1633` (white with `onDark`), heavy weight, wide tracking. The first "A" has no crossbar and contains a small **light-blue `#38BDF8`** triangle.
- `AptricLogo.tsx`: same API (inline and `stacked`, sizes `sm`, `md` and `lg`); only the colours change.

Compare your SVG against the JPG by rendering both side by side in a Playwright screenshot. Iterate until the silhouette, proportions, band overlaps and colour transitions are clearly the same logo.

### 4. Favicon and app icons

Regenerate `frontend/public/favicon.svg` from the new mark, the 32px PNG fallback and the 180px `apple-touch-icon.png` (render the SVG with Playwright, without adding runtime dependencies). Replace `public/LOGO.png` (the root README uses it) with a 500×500 PNG of the new mark on a transparent background. Leave `public/brand/og.png` for session 03.

### 5. UI primitives (`frontend/src/components/ui/`)

Restyle, keeping each component's API backwards-compatible:

- `button.tsx`: pill-shaped (`rounded-full`). Variants: `default` = **Primary** (`bg-gradient-primary`, white text, hover `bg-gradient-primary-hover`, `--shadow-glow`; give it a solid `bg-primary` fallback so a disabled or forced-colours button still reads); `secondary` = **Secondary** (bg `primary-soft` `#E0E7FF`, text `#1D4ED8`, hover `#C7D2FE` with `#1E40AF` text); `outline` = **Outline** (2px `#2563EB` border, `#2563EB` text, hover bg `#EFF6FF`; in dark mode a `#60A5FA` border and text with a low-opacity blue hover fill); `navy` (navy bg, white text, hover `navy-strong`); **new** `violet` (solid violet, white text) if a page needs an achievement CTA; `ghost`, `danger` and `link` (`text-accent-text`) as before. Keep the press scale (`active:scale-[.98]`) and reduced-motion handling, the sizes, and the `loading` and `asChild` behaviour. If buttons render an icon after the label, let it nudge 2px right on hover (reduced-motion aware).
- `card.tsx`: white with a 1px `--border`, `--shadow-sm`, about 16px radius; `#111A33` cards in dark mode. Keep `variant="navy"` (navy gradient, white text) and add `variant="soft"` (Soft Purple `#EDE9FE` background) for highlighted sections.
- `badge.tsx`: rounded-full chips. The default is Soft Purple with `#5B21B6` text; keep or add blue-soft (`primary-soft`), navy-soft, success, danger and warning variants.
- `input.tsx`: about 12px radius, `--border`, blue focus ring.
- `tabs.tsx`: a segmented pill control. The active tab is a white pill with blue text and a shadow on a `--muted` track (or the primary gradient with white text, but pick one and say which).
- `progress.tsx`: the track uses `--muted`, and the fill uses the **primary gradient**. Ring and circle variants get a gradient stroke too.
- `dialog.tsx`, `skeleton.tsx` (slate shimmer), `avatar.tsx`, `stars.tsx` (filled stars in violet, or blue; pick one), `states.tsx` and `page.tsx` (page title in heading ink, bold, tight tracking): align them with the new tokens.

### 6. Style guide (`frontend/src/pages/dev/StyleGuide.tsx`)

Update the dev-only `/dev/styleguide` page so it shows every new and renamed token, the three gradients, gradient text on light and dark, every button variant and size, cards (default, soft, navy), badges, inputs, tabs, progress, and the new logo variants on white, on `#F8FAFC`, on navy and on `#0A1020`, next to the original JPG. It must stay out of production builds (check the `vite build` output).

## Done when

- `npm run lint && npm run typecheck && npm test && npm run build` pass in `frontend/`.
- You have Playwright screenshots of `/dev/styleguide` in light and dark mode at 390px and 1280px, plus the new logo next to the original JPG. Describe what they show.
- Every page still renders. It should already look blue and violet through the tokens, even before the page-specific sessions run.
- Commit ("Re-theme foundation: blue and violet tokens, new logo, UI primitives") and push. In your summary, list the final token values, the renames, the orange leftovers by file, and any spec deviations.
