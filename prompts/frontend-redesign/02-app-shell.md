# Session 02: App shell, navigation, auth dialog and system states

You are continuing the **Aptric** frontend redesign (`frontend/`). Session 01 has already added the brand tokens, font, `AptricMark`, `AptricLogo` and restyled UI primitives. This session restyles the **chrome** that wraps every page.

## Before you start

1. Read `prompts/frontend-redesign/BRAND.md` and `README.md`, and look at `brand-spec.jpg`. The "Usage example" panel shows the target nav: a navy bar, the logo at left, white links, and an orange pill "Get Started" button at right.
2. Read `frontend/src/components/ui/*`, `frontend/src/components/brand/*` and the style guide at `/dev/styleguide` to learn what session 01 built. Reuse it.
3. Read `frontend/src/components/layout/*` (`AppShell.tsx`, `AuthDialog.tsx`, `ErrorBoundary.tsx`, `PageSkeleton.tsx`, `RouteGuards.tsx`) and `frontend/src/context/AuthDialogContext.tsx`.

## Tasks

### 1. Header (`AppShell.tsx`)

- **Signed out**: a navy header (`bg-navy`, or the navy gradient) with `AptricLogo` (white wordmark variant), and on the right "Sign in" (white text button) and an orange **"Get Started"** pill that opens the sign-up dialog. On the landing page the header can sit transparently over the navy hero and turn solid on scroll. Coordinate through a prop or a route check; session 03 builds the hero.
- **Signed in**: choose one style and explain why. Either keep the navy bar with white nav links, where the active link gets an orange underline or pill, or use a white bar with navy text and an orange active indicator. The navy bar matches the spec, and the white bar may be calmer for daily use. Show the streak flame and count in the header if the data is already available from session context (don't add new queries). Keep the avatar dropdown (`UserMenu`) and restyle it with the new card, shadow and radius.
- Keep it sticky, keep the backdrop blur where it fits, and keep the skip link working.
- Keep the content max width (`max-w-5xl`), or widen it to `max-w-6xl` if pages benefit. Pick one and use it consistently.

### 2. Mobile bottom tab bar

- Five tabs (Today, Practice, Compete, Progress, Profile). The active tab gets an orange icon and label with a small orange indicator; inactive tabs use muted navy. Tap targets are at least 44px, and `pb-safe` (safe-area inset) stays.
- In dark mode, use `navy-strong` with a top border.

### 3. Footer

A Dark Navy (`#06132F`) footer with the stacked or small logo, a one-line tagline ("Daily aptitude practice for placements and competitive exams"), links (Terms, and others that already exist), and © year. It stays compact on the signed-in app and can be richer on the landing page (session 03 may extend it). On phones it must not hide behind the bottom tab bar.

### 4. `FocusLayout` (solve and onboarding screens)

This is a minimal top bar: the mark only (no wordmark), an exit or close button, and nothing that distracts. It uses the off-white page background.

### 5. Auth dialog (`AuthDialog.tsx`)

- Restyle it as a branded modal. Put a navy gradient header strip with `AptricMark` and the heading ("Welcome back" or "Create your account") at the top, and a white body below. In dark mode the body is navy.
- The Google button is outline style with the Google "G". The primary submit is an orange pill. Mode switches (sign in, sign up, magic link, forgot password) are text links in `accent-text`.
- Inputs use the new `Input`, with clear inline errors in the danger token. The password-strength hint (if any) uses the orange-gradient progress.
- **Don't change any auth logic**, validation or API calls.

### 6. System states

- `ErrorBoundary.tsx` (`RouteError`, `NotFound`): a centred, friendly layout with a large faded `AptricMark` or a navy illustration, a bold navy heading ("Page not found" or "Something went wrong"), muted text, an orange "Go home" pill and an outline "Try again" button.
- `PageSkeleton.tsx` and `Skeleton`: navy-tinted shimmer (respect reduced motion).
- Toasts (`ToastContext.tsx`): a white card with a coloured left accent (success, danger, or orange for info), or a navy card in dark mode. Restyle markup and classes only.
- `RouteGuards.tsx` loading state: centred mark with a gentle pulse.

## Done when

- Lint, typecheck, tests and build pass.
- You have screenshots (390px and 1280px, light and dark) of: the signed-out header, the signed-in header (stub the session if needed), the mobile tab bar, the footer, the auth dialog in each mode, the 404 page and the route error page.
- No page component outside `components/layout`, `context/ToastContext.tsx` and the shell is restyled in this session.
- Commit ("Redesign app shell, navigation and auth dialog") and push. Summarise the header style you chose and why.
