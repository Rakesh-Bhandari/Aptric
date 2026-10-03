# Aptric brand spec (shared by every redesign session)

Read this file in full before you change any UI. Every prompt in `prompts/frontend-redesign/` depends on it.

> **This is a re-theme.** The app was redesigned earlier in a **navy and orange** brand. That palette is retired. The new brand is **navy, blue and violet** with blue → violet gradients. Layouts, components and page structure from the earlier redesign mostly stay. The colours, gradients, logo, hero and a few surface treatments change. Remove all orange from the brand (the only warm colours left are semantic ones: the streak flame, gold and warning).

Reference images in the repo:

- `prompts/frontend-redesign/brand-spec.jpg`: the full colour palette, both gradients, the three button styles, and a usage example of the landing hero in **light** and **dark** themes ("Practice. / Compete. / Grow.")
- `frontend/public/brand/aptric-logo-wordmark.jpg`: the logo mark above the "APTRIC" wordmark, on white
- `frontend/public/brand/aptric-mark.jpg`: the "A" mark alone, on white

Open the images with the Read tool so you can see them. Don't guess what they look like.

## Personality

Modern • Professional • Clean • Tech • Engaging. Deep navy stands for trust, electric blue for action, violet for energy and achievement, and light blue for interaction. Cool neutrals (slate) keep the interface clean. The product is a daily aptitude practice app for Indian students who are preparing for placements and competitive exams. Most of them use it on a phone.

## Logo

- **Mark**: a rounded, ribbon-like "A" built from three overlapping bands:
  - **Left leg**: deep navy-blue (about `#00227F` at the top to `#00175F` near the foot), with a darker diagonal shadow (about `#061640`) where the crossbar tucks under it near the foot.
  - **Right leg**: a ribbon from **cyan** `#00E5FF` on its outer edge to **electric blue** `#0050FF` on its inner edge, folding over the apex.
  - **Crossbar**: a wave that sweeps up from the bottom-left foot and across to the bottom-right foot, shading from **light blue** `#38BDF8` on the left through blue `#4F7BFF` to **violet** (about `#7B18FE`) on the right. It ends in the rounded right foot.
  - All ends are generously rounded; the inner counter is a clean triangle.
- **Wordmark**: "APTRIC" in a bold, wide, geometric sans with tight letterforms, in deep navy `#0A1633`. The first "A" has no crossbar and holds a small **light-blue** (`#38BDF8`) triangle.
- The supplied files are JPGs on white, so they **can't** go on navy or dark backgrounds. The `AptricMark`, `AptricWordmark` and `AptricLogo` components (in `frontend/src/components/brand/`) are inline SVGs. Session 01 **redraws** them for the new logo. Every later session uses those components, never the JPGs.

## Colour palette

| Token name (suggested) | Hex | Use |
| --- | --- | --- |
| Primary Navy | `#0A2540` | Branding, footer, dark panels, headings |
| Primary Blue | `#2563EB` | Buttons, CTAs, highlights, links on light |
| Violet | `#7C3AED` | Active states, accents, achievements |
| Light Blue | `#38BDF8` | Hover states, icons, links **on dark surfaces only** |
| Soft Purple | `#EDE9FE` | Badges, section backgrounds |
| Text Primary | `#0F172A` | Main text, headings |
| Text Secondary | `#475569` | Secondary text, descriptions |
| Background | `#F8FAFC` | Main background, surfaces |
| Card Background | `#E2E8F0` | Muted cards and sections, borders, dividers |
| White | `#FFFFFF` | Cards, containers, clean space |

Gradients:

- **Primary gradient**: `#2563EB` → `#7C3AED` (left to right, or 135°). Hero accents, primary buttons, progress fills, highlights.
- **Secondary gradient**: `#38BDF8` → `#7C3AED`. Cards, accents, decorative backgrounds, illustrations. Decorative only: never put body text on it, and never use it as a text fill on light surfaces.
- **Navy gradient** (for dark feature panels, kept from the earlier redesign): `#0A2540` → `#1E3A8A`, optionally with a soft violet glow (`#7C3AED` at low opacity) in one corner.

## Buttons (from the spec)

| Variant | Rest | Hover |
| --- | --- | --- |
| Primary ("Get Started →") | primary gradient bg, text `#FFFFFF`, pill shape | gradient `#1D4ED8` → `#6D28D9` |
| Secondary ("Learn More") | bg `#E0E7FF`, text `#1D4ED8`\*, pill shape | bg `#C7D2FE`, text `#1E40AF` |
| Outline ("Explore") | 1.5–2px border `#2563EB`, text `#2563EB`, transparent bg, pill shape | bg `#EFF6FF` |

Buttons are **fully rounded pills** (`rounded-full`) with semibold text. The primary button usually carries a trailing arrow icon (`→`, lucide `ArrowRight`) that nudges right on hover.

\* See the accessibility section.

## Accessibility: required deviations

The repo has a WCAG AA contrast test (`frontend/src/test/contrast.test.ts`) that checks every text and background token pair at 4.5:1 in both themes. It must keep passing, and any new token pairs you introduce go into it. Measured against the spec:

- **Passes**: white on `#2563EB` (5.2:1), white on `#7C3AED` (5.7:1), white on the hover stops `#1D4ED8` (6.7:1) and `#6D28D9` (7.1:1). The primary gradient button keeps **white text**. Test both gradient stops as solid backgrounds. `#2563EB` text passes on white (5.2:1) and on `#F8FAFC` (4.9:1). `#475569` passes on white, `#F8FAFC` and `#E2E8F0`.
- **Secondary button**: the spec's `#2563EB` text on `#E0E7FF` is **4.2:1 and fails**. Use `#1D4ED8` text (5.4:1), and `#1E40AF` on the hover bg `#C7D2FE` (5.9:1).
- **Light Blue `#38BDF8`** is 2.1:1 on white. **Never** use it for text, or for an icon that carries meaning, on light surfaces. On navy and dark surfaces it passes (7:1 or more) and is the preferred link and icon colour there. White text on `#38BDF8` also fails, so the dark-theme hero button in the spec (light blue → blue with white text) becomes the normal primary gradient.
- **`#2563EB` on `#E2E8F0`** is 4.2:1 and fails. Blue text on a muted grey surface uses `#1D4ED8`.
- **Gradient text** (the hero's "Grow."): large display text needs 3:1. On light backgrounds use the primary gradient (`#2563EB` → `#7C3AED`). On dark backgrounds use `#38BDF8` → `#A78BFA` (violet `#7C3AED` is only 2.7–3.3:1 on navy).
- Focus rings need 3:1 against the surface they sit on. `#2563EB` works on white and light surfaces; on navy and dark surfaces use `#38BDF8`.

Write down any other deviation from the spec in the session's final message.

## Dark mode

The app supports light, dark and device themes through `data-theme` on `<html>`. The spec's dark usage example is a deep midnight navy with blue and violet glows:

- page background around `#0A1020`, cards `#111A33`, raised cards or muted surfaces `#1A2547`, borders around `#24304F`
- text `#E2E8F0`, headings `#F8FAFC`, muted text `#94A3B8`
- primary actions keep the primary gradient with white text
- links, accent text and icons use `#60A5FA` or `#38BDF8`; violet accents use `#A78BFA`; soft badge fills become low-opacity tints (for example violet `#2A1F57` with `#C4B5FD` text, blue `#172554` with `#BFDBFE` text)
- hero and feature panels can add soft radial glows in blue (`#2563EB`) and violet (`#7C3AED`) at 15–30% opacity

## Light mode surfaces

Unlike the earlier navy-chrome redesign, the spec's light usage example is **light**: a white or very pale header with navy links and a gradient "Get Started" pill, and a light hero (`#F8FAFC` fading into a soft lavender and blue mist) with a navy headline. Navy is now an accent surface (footer, dark feature cards, the daily hero card), not the default chrome.

## Typography

Keep the current font setup (Plus Jakarta Sans, weights 400–800, with system fallbacks) unless it's missing. Headings are heavy (700–800), tightly tracked and in Text Primary or Navy. Hero headlines are huge and stacked, as in "Practice. / Compete. / **Grow.**", with the last word in gradient text.

## Shape, depth and motion

- Radius: cards about 16px, inputs about 12px, buttons and chips fully rounded.
- Use soft, slate- or navy-tinted shadows (for example `0 1px 2px rgb(15 23 42 / .06), 0 8px 24px rgb(15 23 42 / .06)`). Primary buttons may add a faint coloured glow (`0 8px 20px rgb(37 99 235 / .25)`).
- Motion is subtle: 150–250ms ease-out. Respect `prefers-reduced-motion` and the in-app `data-reduce-motion` switch that already exists.

## Colour roles, old → new

Use this when you replace the old palette in a file:

| Old role (navy and orange) | New role |
| --- | --- |
| Orange CTA pill (`bg-primary`, navy text) | Primary gradient pill, white text |
| Orange highlight, selected state, active indicator | Primary Blue `#2563EB` (or violet `#7C3AED` for "active" and achievement) |
| Orange-gradient fills (progress, XP, rings) | Primary gradient |
| Soft orange tint (`bg-primary-soft`) | Soft blue `#E0E7FF` for interactive tints, Soft Purple `#EDE9FE` for badges and section backgrounds |
| Orange accent text (`text-accent-text`, `#C2410C`) | `#2563EB` light, `#60A5FA` dark |
| `--orange-light` `#FF9A3D` on navy | Light Blue `#38BDF8` on navy |
| Navy header and chrome in light mode | White or translucent header with navy text; navy stays for the footer |
| Orange-gradient hero word on navy | Primary gradient word on the light hero, `#38BDF8` → `#A78BFA` on the dark hero |

## Things that must not change

- Data fetching, RPC calls, query keys, routes, auth flows and game logic in `src/lib/*` and `src/context/*`. This is a visual redesign only.
- Accessibility features: the skip link, focus rings (visible in both themes), aria labels, keyboard shortcuts in Solve (`1`–`4`, `Enter`) and reduced motion.
- Existing tests. Update a test only when it asserts on markup, classes or token values that the re-theme deliberately changes, and say so.
