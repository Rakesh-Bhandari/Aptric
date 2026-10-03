# Session 09: Polish, consistency and QA

You are finishing the **Aptric** frontend re-theme (`frontend/`) from navy and orange to **navy, blue and violet**. Sessions 01–08 are merged. This session is a **quality pass across the whole app**. Fix inconsistencies and leftovers, don't redesign.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `README.md`, and look at `brand-spec.jpg`.
2. Run `git log --oneline -30` and read the summaries of the re-theme commits to learn the decisions made (token values, renames, tab and star styles, deviations).

## Tasks

1. **Orange leftovers.** Grep the whole of `frontend/` (excluding `node_modules` and `dist`) for `orange`, `#ff7800`, `#ff9a3d`, `#e86600`, `#d95f00`, `#d95a00`, `#c2410c`, `#fff1e6`, `#9a3412`, `#ffc999`, `#3a2412`, `gradient-orange` and `orange-light`, plus the older palette (`indigo`, `#4f46e5`, `#4338ca`, `#8b93ff`). Also check raw hex values in `.tsx`/`.jsx`/`.css` outside `index.css`, Tailwind palette classes such as `bg-blue-500`, `text-gray-*` or `text-orange-*`, and the SVGs and PNGs in `public/` (favicon, apple-touch icon, `LOGO.png`, `og.png`). Replace them with tokens. Only the semantic warm colours (`--streak`, `--gold`, warning, the gold and bronze metals and medals) may stay warm.
2. **Visual audit.** With Playwright, screenshot **every route** in `src/App.tsx` (including admin and `/dev/styleguide`) at 360px, 390px, 768px and 1280px, in light and dark mode, with mocked API data (reuse the mock fixture in `frontend/e2e/` if one exists, or create a small reusable one). Look at every screenshot and list the inconsistencies: spacing, radii, shadow levels, heading sizes, button variants used for the same kind of action (a primary-gradient pill for the one main action per screen, outline or secondary for the rest), chip colours (blue soft for interactive and info, Soft Purple for badges and kinds, violet for achievements and live), empty, loading and error states, and icon sizes.
3. **Fix them**, preferring changes to shared primitives and tokens over per-page overrides.
4. **Responsiveness**: no horizontal page scroll at 360px on any route, the bottom tab bar never covers content or the sticky solve action bar, and tap targets are at least 44px.
5. **Accessibility**:
   - The contrast test passes. Spot-check the real rendered pairs with axe (`@axe-core/playwright` as a dev dependency is OK) on the main routes, and fix serious and critical issues. Pay attention to text on gradients (check both stops), light-blue `#38BDF8` used on light surfaces, and blue text on `#E2E8F0`.
   - Focus rings are visible on every interactive element in both themes, including on navy and gradient surfaces.
   - Colour is never the only signal (correct and wrong, zones, states keep icons and text).
   - Reduced motion (OS setting and the in-app toggle) disables every animation (confetti, pulses, scroll reveals, shimmer, button arrow nudge, typing dots).
6. **Theme**: check the light, dark and device modes, the flash-free theme script in `index.html`, the `theme-color` meta, the light header and light hero in light mode, and the logo legibility on every surface (white, `#F8FAFC`, navy, midnight).
7. **Performance**: compare `vite build` chunk sizes with `main` before the re-theme. Make sure the fonts are `display=swap`, the hero SVG doesn't cause layout shift, `/dev/styleguide` isn't in the production bundle, and no unused dependencies were added.
8. **Docs**: update the "Design system" section of `frontend/README.md` (tokens, gradients, button variants, logo components, the style-guide route, and the accessibility deviations: `#1D4ED8` text on the secondary button, no light-blue text on light surfaces). Update the root `README.md` where it describes or shows the old navy and orange theme (badges, colours, logo image, screenshots).

## Done when

- `npm run lint && npm run typecheck && npm test && npm run build` pass.
- The orange grep from task 1 returns only allowed semantic colours, and you list them.
- You've attached before and after screenshots of the main routes (Landing, Today, Solve, Summary, Practice, Progress, Compete and Profile) at 390px and 1280px.
- Commit ("Re-theme polish: leftovers, consistency, a11y and responsive fixes") and push. In your summary, list what you fixed, what you couldn't fix, and any remaining spec deviations for the owner to decide.
