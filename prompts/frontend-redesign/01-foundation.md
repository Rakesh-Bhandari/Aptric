# Session 01: Brand foundation (tokens, fonts, logo, UI primitives)

You are redesigning the frontend of **Aptric**, a React 19 + TypeScript + Vite + Tailwind CSS v4 + Radix UI app in `frontend/`, so that it matches the new brand. This is the **first of nine sessions**. It builds the foundation that every later session reuses, so get the tokens and primitives right. **Don't restyle individual pages in this session**: they should simply pick up the new tokens.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `prompts/frontend-redesign/README.md` (shared rules).
2. Open `prompts/frontend-redesign/brand-spec.jpg`, `frontend/public/brand/aptric-logo-wordmark.jpg` and `frontend/public/brand/aptric-mark.jpg` with the Read tool.
3. Read `frontend/src/index.css`, `frontend/src/test/contrast.test.ts`, `frontend/index.html`, `frontend/src/components/layout/Logo.tsx` and everything in `frontend/src/components/ui/`.

## Tasks

### 1. Colour tokens (`frontend/src/index.css`)

Replace the indigo palette with the brand palette and **keep every existing token name**. Pages, the admin aliases (`--bg`, `--card-bg` and so on) and the contrast test depend on those names. Map them like this:

- `--background` Off White `#F7F9FC`; `--card` `#FFFFFF`; `--foreground` and `--card-foreground` `#0B1F4B` for headings, or `#26354D` for body. Choose one for `--foreground`, and add `--heading` `#0B1F4B` if you split them.
- `--muted` a light navy tint (around `#EEF2F8`); `--muted-foreground` around `#5E6A80` (must pass AA on `--background`, `--card` and `--muted`); `--border` `#E3E8F0`; `--input` slightly darker.
- `--primary` **orange `#FF7800`**, `--primary-strong` `#E86600`, `--primary-foreground` **`#06132F`** (see the accessibility section of BRAND.md), `--primary-soft` `#FFF1E6`, and `--primary-soft-foreground` a dark orange-brown that passes AA (around `#9A3412`).
- New tokens: `--navy` `#0B1F4B`, `--navy-strong` `#06132F`, `--navy-foreground` `#FFFFFF`, `--navy-soft` (light navy tint), `--accent-text` (`#C2410C` light, `#FF9A3D` dark), `--orange-light` `#FF9A3D`, and gradient tokens `--gradient-navy` and `--gradient-orange`. Expose the colours through `@theme inline` so classes such as `bg-navy`, `text-accent-text` and `bg-navy-strong` work.
- `--ring` must be visible on white and on navy (orange works).
- `--streak` stays an orange; `--gold`, success, danger and warning keep their meaning but get re-tuned to sit well beside navy and orange.
- **Dark theme** (`[data-theme='dark']`): use the navy-based palette from BRAND.md.
- Shadows: add `--shadow-sm`, `--shadow-md` and `--shadow-lg` (navy-tinted) and expose them to Tailwind.
- Radius: set `--radius` to about `1rem` for cards.
- Update `index.html` `theme-color` to fit, ideally with separate light and dark `<meta name="theme-color" media=...>` tags.

Update `contrast.test.ts`: keep every existing pair, add the new text pairs (`navy-foreground` on `navy`, `accent-text` on `card` and `background`, `primary-foreground` on `primary-strong`), and fix the "status fills" check for `primary`, which now carries navy text rather than white. Every pair must pass.

### 2. Font

Load **Plus Jakarta Sans** (or Manrope) from Google Fonts in `index.html` (preconnect, weights 400–800, `display=swap`), and set it as `--font-sans` with the current fallbacks. Add `--font-display` for the hero and headings if you want a tighter heading style.

### 3. Logo components

Create `frontend/src/components/brand/`:

- `AptricMark.tsx`: an inline **SVG recreation of the ribbon "A"** from `aptric-mark.jpg`, with a navy left leg and an orange ribbon right leg and crossbar, using `<linearGradient>`s and rounded joins. Use unique gradient ids (`useId`) so several marks on one page don't clash. Props: `className`, `title` (for an accessible label; `aria-hidden` when it has none). It must look right on white **and** on navy. Add a subtle light edge or adjust the left leg's shade in dark contexts if the navy leg disappears, and use a `variant?: 'default' | 'onDark'` prop if needed.
- `AptricWordmark.tsx`: "APTRIC" set in the brand font, in heavy weight, wide tracking and navy (white with `onDark`). The first "A" has no crossbar and contains a small orange triangle, as in the logo image. An SVG `<text>` or a styled span is fine.
- `AptricLogo.tsx`: the mark and wordmark side by side (for nav bars) and a `stacked` variant (mark above the wordmark, for the landing hero and the footer). Sizes are `sm`, `md` and `lg`.

Make `components/layout/Logo.tsx` re-export or wrap `AptricLogo`, so existing imports keep working.

Compare your SVG against the JPG by rendering both in a Playwright screenshot. Iterate until the silhouette, proportions and colour split are clearly the same logo.

### 4. Favicon and app icons

Generate `frontend/public/favicon.svg` from the mark, plus a 32px PNG fallback and a 180px `apple-touch-icon.png` (render the SVG with Playwright or sharp, whichever is already available, without adding runtime dependencies). Update `index.html`. Keep `public/LOGO.png` (the README uses it), but replace its contents with a 500×500 PNG of the new mark on a transparent background.

### 5. UI primitives (`frontend/src/components/ui/`)

Restyle, keeping each component's API backwards-compatible:

- `button.tsx`: pill-shaped (`rounded-full`). Variants: `default` = **Primary** (orange bg, navy text, hover `--primary-strong`); **new** `navy` = **Secondary** (navy bg, white text, hover `navy-strong`); `outline` = **Outline** (2px navy border, navy text, hover fills navy with white text; in dark mode a light border and text that fill on hover); `secondary` = soft orange tint; `ghost`, `danger` and `link` (`text-accent-text`) as before. Add a subtle press scale (`active:scale-[.98]`) that respects reduced motion. Keep the sizes and the `loading` and `asChild` behaviour.
- `card.tsx`: white with a 1px border, `--shadow-sm`, rounded about 16px; navy cards in dark mode. Add an optional `variant="navy"` (the navy gradient background, white text) for feature or hero cards.
- `badge.tsx`: rounded-full chips. The default is soft orange; add navy-soft, success, danger and warning variants.
- `input.tsx`: about 12px radius, Border colour, orange focus ring.
- `tabs.tsx`: a segmented pill control. The active tab is a navy fill with white text (orange underline in dark mode is acceptable).
- `progress.tsx`: the track uses `--muted`, and the fill uses the **orange gradient**. Keep any ring or circle variants and give them the gradient stroke too.
- `dialog.tsx`, `skeleton.tsx`, `avatar.tsx`, `stars.tsx` (filled stars in orange), `states.tsx` and `page.tsx` (page title in navy, bold, tight tracking): align them with the new tokens.

### 6. A token preview page (dev only)

Add `frontend/src/pages/dev/StyleGuide.tsx`, routed at `/dev/styleguide` **only when `import.meta.env.DEV`**. It renders every colour token, both gradients, all button variants and sizes, cards, badges, inputs, tabs, progress, the logo variants on white and on navy, and the type scale. Later sessions use it to check consistency. Make sure it's tree-shaken out of production builds (check the `vite build` output).

## Done when

- `npm run lint && npm run typecheck && npm test && npm run build` pass in `frontend/`.
- You have Playwright screenshots of `/dev/styleguide` in light and dark mode at 390px and 1280px, plus the logo next to the original JPG. Describe what they show.
- Every page still renders (it should now look navy and orange through the tokens, even before the page-specific sessions run).
- Commit ("Brand foundation: tokens, fonts, logo, UI primitives") and push. In your summary, list the final token values and any spec deviations.
