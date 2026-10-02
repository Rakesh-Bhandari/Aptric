# Session 09: Polish, consistency and QA

You are finishing the **Aptric** frontend redesign (`frontend/`). Sessions 01–08 are merged. Every page now uses the navy and orange brand. This session is a **quality pass across the whole app**. Fix inconsistencies, don't redesign.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `README.md`, and look at `brand-spec.jpg`.
2. Run `git log --oneline -30` and read the summaries of the earlier redesign commits to learn the decisions made (header style, hero headline, token values, deviations).

## Tasks

1. **Visual audit.** With Playwright, screenshot **every route** in `src/App.tsx` (including admin and `/dev/styleguide`) at 360px, 390px, 768px and 1280px, in light and dark mode, with mocked API data (create a small reusable mock fixture in `frontend/e2e/fixtures/` or similar if none exists). Look at every screenshot and list the inconsistencies: spacing, radii, shadow levels, heading sizes, button variants used for the same kind of action, chip colours, empty, loading and error states, and icon sizes.
2. **Fix them**, preferring changes to shared primitives and tokens over per-page overrides. Grep for leftovers from the old palette: `indigo`, `violet`, `#4f46e5`, `#4338ca`, `#8b93ff`, raw hex values in `.tsx`/`.jsx`/`.css` outside `index.css`, and Tailwind palette classes such as `bg-blue-500` or `text-gray-*`. Replace them with tokens.
3. **Responsiveness**: no horizontal page scroll at 360px on any route, the bottom tab bar never covers content or the sticky solve action bar, and tap targets are at least 44px.
4. **Accessibility**:
   - Contrast test passes. Spot-check the real rendered pairs with axe (`@axe-core/playwright` as a dev dependency is OK) on the main routes, and fix serious and critical issues.
   - Focus rings are visible on every interactive element in both themes, including on navy surfaces.
   - Colour is never the only signal (correct and wrong, zones, states keep icons and text).
   - Reduced motion (OS setting and the in-app toggle) disables every new animation (confetti, pulses, scroll reveals, shimmer).
5. **Theme**: check the light, dark and device modes, the flash-free theme script in `index.html`, the `theme-color` meta, and the logo legibility on every surface.
6. **Performance**: compare `vite build` chunk sizes with `main` before the redesign (`git stash` or a worktree). Make sure the fonts are preloaded or `display=swap`, the hero SVG doesn't cause layout shift, `/dev/styleguide` isn't in the production bundle, and no unused dependencies were added.
7. **Docs**: update `frontend/README.md` (and the screenshot or logo reference in the root `README.md` if useful) with a short "Design system" section covering the tokens, button variants, logo components, the style-guide route, and the accessibility deviation (navy text on orange buttons).

## Done when

- `npm run lint && npm run typecheck && npm test && npm run build` pass.
- You've attached before and after screenshots of the main routes (Landing, Today, Solve, Summary, Practice, Progress, Compete and Profile) at 390px and 1280px.
- Commit ("Redesign polish: consistency, a11y and responsive fixes") and push. In your summary, list what you fixed, what you couldn't fix, and any remaining spec deviations for the owner to decide.
