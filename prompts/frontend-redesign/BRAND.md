# Aptric brand spec (shared by every redesign session)

Read this file in full before you change any UI. Every prompt in `prompts/frontend-redesign/` depends on it.

Reference images in the repo:

- `prompts/frontend-redesign/brand-spec.jpg`: the full colour palette, gradients, button styles and a usage example (dark hero, nav, "Build. Solve. Grow.")
- `frontend/public/brand/aptric-logo-wordmark.jpg`: the logo mark above the "APTRIC" wordmark, on white
- `frontend/public/brand/aptric-mark.jpg`: the "A" mark alone, on white

Open the images with the Read tool so you can see them. Don't guess what they look like.

## Personality

Modern • Clean • Tech • Bold • Professional. Deep navy stands for trust and stability, orange for energy and action, and neutrals keep the interface clean. The product is a daily aptitude practice app for Indian students who are preparing for placements and competitive exams. Most of them use it on a phone.

## Logo

- **Mark**: a rounded, ribbon-like "A". The left leg is navy (`#0B1F4B` to `#06132F`). An orange ribbon (`#FF7800` to `#FF9A3D`, with darker `#FF5A00`-ish shading) folds over the right leg and sweeps across to form the crossbar.
- **Wordmark**: "APTRIC" in a bold, wide, geometric sans with tight letterforms, in navy. The first "A" has no crossbar and holds a small orange triangle.
- The supplied files are JPGs on white, so they **can't** go on navy or dark backgrounds. Session 01 rebuilds the mark as an inline SVG component (`AptricMark`) with gradients, plus a wordmark component. Every later session uses those components, never the JPGs.

## Colour palette

| Token name (suggested) | Hex | Use |
| --- | --- | --- |
| Primary Navy | `#0B1F4B` | Branding, navbar, headings |
| Dark Navy | `#06132F` | Footer, hero sections, dark-mode background base |
| Primary Orange | `#FF7800` | Buttons, CTAs, highlights |
| Light Orange | `#FF9A3D` | Hover states, accents |
| Soft Orange | `#FFF1E6` | Badges, tinted backgrounds |
| White | `#FFFFFF` | Main background, cards |
| Off White | `#F7F9FC` | Section backgrounds, page background |
| Text Primary | `#26354D` | Body text, content |
| Muted Text | `#6B778C` | Secondary text, descriptions |
| Border | `#E3E8F0` | Borders, dividers |

Gradients:

- **Navy gradient**: `#0B1F4B` → `#123A78`, for hero sections and dark feature panels
- **Orange gradient**: `#FF7800` → `#FF9A3D`, for highlights and accents (progress fills, streak flames, the hero accent word)

## Buttons (from the spec)

| Variant | Rest | Hover |
| --- | --- | --- |
| Primary ("Get Started") | bg `#FF7800`, text white, pill shape | bg `#E86600` |
| Secondary ("Learn More") | bg `#0B1F4B`, text white, pill shape | bg `#06132F` |
| Outline ("Explore") | 1.5–2px border `#0B1F4B`, text `#0B1F4B`, transparent bg, pill shape | bg `#0B1F4B`, text white |

Buttons are **fully rounded pills** (`rounded-full`) with semibold text.

## Accessibility: a required deviation

The repo has a WCAG AA contrast test (`frontend/src/test/contrast.test.ts`) that checks every text and background token pair at 4.5:1 in both themes. It must keep passing, and any new token pairs you introduce go into it. Some colours in the spec don't meet AA:

- White text on `#FF7800` is about **2.6:1**, and white on `#E86600` is about **3.3:1**. Both fail. **Resolution**: orange buttons use **Dark Navy `#06132F` text** (about 6:1). The button stays orange and pill-shaped. If the project owner later decides they want white text, they need a darker orange such as `#C2410C`.
- Orange `#FF7800` as **text** on white fails. For orange text in light mode (links, accent words on light backgrounds), use an `--accent-text` token of about `#C2410C`. On navy backgrounds, `#FF9A3D` and `#FF7800` both pass and can be used as text.
- Muted Text `#6B778C` on white is about 4.6:1 and passes. On Off White, re-check it, and darken it slightly (for example `#5E6A80`) if it fails.

Write down any other deviation from the spec in the session's final message.

## Dark mode

The app supports light, dark and device themes through `data-theme` on `<html>`. Build the dark theme from the navy family:

- page background `#06132F`, cards `#0B1F4B` or a step between (e.g. `#0E2552`), borders around `#1E3563`
- text `#E8EDF7`, muted text around `#A3B0C8`
- primary actions stay orange, and orange text uses `#FF9A3D`
- the hero and footer, which are navy in light mode, can stay as they are

## Typography

Use a geometric sans that fits the wordmark. Use **Plus Jakarta Sans** or **Manrope** for UI and headings (Google Fonts, weights 400/500/600/700/800), loaded in `index.html` with `display=swap` and a system fallback. Headings are bold, tightly tracked and navy. Hero headlines are huge and stacked, as in "Build. / Solve. / **Grow.**", with the last word in orange.

## Shape, depth and motion

- Radius: cards about 16px, inputs about 12px, buttons and chips fully rounded.
- Use soft, navy-tinted shadows (e.g. `0 1px 2px rgb(11 31 75 / .06), 0 8px 24px rgb(11 31 75 / .06)`), not grey ones.
- Motion is subtle: 150–250ms ease-out. Respect `prefers-reduced-motion` and the in-app `data-reduce-motion` switch that already exists.

## Things that must not change

- Data fetching, RPC calls, query keys, routes, auth flows and game logic in `src/lib/*` and `src/context/*`. This is a visual redesign only.
- Accessibility features: the skip link, focus rings (use an orange or navy ring that's visible in both themes), aria labels, keyboard shortcuts in Solve (`1`–`4`, `Enter`) and reduced motion.
- Existing tests. Update a test only when it asserts on markup or classes that the redesign deliberately changes, and say so.
