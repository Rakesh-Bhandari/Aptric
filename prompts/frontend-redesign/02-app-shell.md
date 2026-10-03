# Session 02: App shell, navigation, auth dialog and system states

You are continuing the **Aptric** frontend re-theme (`frontend/`) from navy and orange to **navy, blue and violet**. Session 01 has already replaced the brand tokens, redrawn `AptricMark`, `AptricWordmark` and `AptricLogo`, and restyled the UI primitives. This session re-themes the **chrome** that wraps every page.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `README.md`, and look at `brand-spec.jpg`. The two "Usage example" panels show the target nav. **Light**: a white header, the logo at left, navy links, and a primary-gradient "Get Started" pill at right. **Dark**: a midnight header with white links and the same pill.
2. Read `frontend/src/components/ui/*`, `frontend/src/components/brand/*` and the style guide at `/dev/styleguide` to learn what session 01 built. Reuse it.
3. Read `frontend/src/components/layout/*` (`AppShell.tsx`, `AuthDialog.tsx`, `AuthCard.tsx`, `ErrorBoundary.tsx`, `PageSkeleton.tsx`, `RouteGuards.tsx`), `frontend/src/context/AuthDialogContext.tsx` and `frontend/src/context/ToastContext.tsx`.

## Tasks

### 1. Header (`AppShell.tsx`)

The header is currently a navy bar in both themes. Move it to the new `--header` tokens:

- **Signed out**: a white (light) or midnight (dark) header with `AptricLogo` (default variant in light, `onDark` in dark), navy (light) or white (dark) links, "Sign in" as a ghost or text button, and a primary-gradient **"Get Started →"** pill that opens the sign-up dialog. On the landing page the header can sit transparently over the hero and become solid, with a hairline `--border` and a soft shadow, on scroll.
- **Signed in**: the same white or midnight bar. Nav links are `--header-muted-foreground`; the active link is `#2563EB` (dark: `#60A5FA`) with a 2px primary-gradient underline or a soft-blue pill. Keep the streak flame and count if it's already there. Keep the avatar dropdown (`UserMenu`) and restyle it with the new card, shadow and radius.
- Keep it sticky, keep a light backdrop blur (`bg-header/80 backdrop-blur`), keep `--header-h` correct, and keep the skip link working.
- Keep the current content max width.

### 2. Mobile bottom tab bar

- Five tabs (Today, Practice, Compete, Progress, Profile) on a white (light) or midnight (dark) bar with a top border. The active tab gets a blue icon and label (dark: `#60A5FA`) with a small primary-gradient indicator; inactive tabs use `--muted-foreground`. Tap targets are at least 44px, and `pb-safe` (safe-area inset) stays.

### 3. Footer

A **Primary Navy** (`#0A2540`, `--chrome`) footer in both themes, with the small or stacked logo in its `onDark` variant, a one-line tagline ("Daily aptitude practice for placements and competitive exams"), links in `--chrome-muted-foreground` that turn `#38BDF8` on hover, and © year. Add a faint blue → violet glow or a 1px secondary-gradient top line if it helps. It stays compact on the signed-in app and can be richer on the landing page. On phones it must not hide behind the bottom tab bar.

### 4. `FocusLayout` (solve and onboarding screens)

This is a minimal top bar: the mark only (no wordmark), an exit or close button, and nothing that distracts. It uses the `--background` page colour.

### 5. Auth dialog (`AuthDialog.tsx`, `AuthCard.tsx`)

- A branded modal. The header strip uses the **navy gradient** with a soft violet glow, `AptricMark` (`onDark`) and the heading ("Welcome back" or "Create your account") in white. The body is white (dark: `#111A33`).
- The Google button is outline style with the Google "G". The primary submit is a primary-gradient pill with white text. Mode switches (sign in, sign up, magic link, forgot password) are text links in `accent-text`.
- Inputs use the new `Input`, with clear inline errors in the danger token. The password-strength hint (if any) uses the primary-gradient progress.
- **Don't change any auth logic**, validation or API calls.

### 6. System states

- `ErrorBoundary.tsx` (`RouteError`, `NotFound`): a centred layout with a large faded `AptricMark` over a soft blue and violet radial glow, a bold heading ("Page not found" or "Something went wrong"), muted text, a primary-gradient "Go home" pill and an outline "Try again" button.
- `PageSkeleton.tsx` and `Skeleton`: slate shimmer (respect reduced motion).
- Toasts (`ToastContext.tsx`): a white card (dark: `#111A33`) with a coloured left accent: success, danger, or **blue** for info and violet for achievements. Restyle markup and classes only.
- `RouteGuards.tsx` loading state: the centred mark with a gentle pulse.

## Done when

- Lint, typecheck, tests and build pass.
- No orange remains in `components/layout/*` or `ToastContext.tsx` (see the grep in README.md).
- You have screenshots (390px and 1280px, light and dark) of: the signed-out header, the signed-in header (stub the session if needed), the header scrolled over the landing hero, the mobile tab bar, the footer, the auth dialog in each mode, the 404 page and the route error page.
- No page component outside `components/layout`, `context/ToastContext.tsx` and the shell is restyled in this session.
- Commit ("Re-theme app shell, navigation and auth dialog") and push.
