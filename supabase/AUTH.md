# Aptric – Auth setup

The frontend uses Supabase Auth via `supabase-js` only: no custom JWTs, no password hashing in our code.

| Flow | Frontend call | Lands on |
| --- | --- | --- |
| Email + password sign-up (confirmation required) | `auth.signUp` | email → `/auth/callback?token_hash…&type=email` → `next` |
| Email + password sign-in | `auth.signInWithPassword` | in place |
| Magic link | `auth.signInWithOtp` | email → `/auth/callback?token_hash…&type=email` → `next` |
| Google OAuth | `auth.signInWithOAuth({ provider: 'google' })` | Google → Supabase → `/auth/callback?code=…` → `next` |
| Password reset | `auth.resetPasswordForEmail` then `auth.updateUser({ password })` | email → `/auth/callback?…&type=recovery` → `/auth/reset-password` |
| Resend confirmation | `auth.resend({ type: 'signup' })` | same as sign-up |

After sign-in, any user whose `profiles.handle` is `null` gets sent to `/onboarding` to choose one (migration `20261001000006_onboarding_handle.sql`).

Frontend pieces (`frontend/src`):

- `lib/supabase.js`: the client (PKCE flow, persisted session, auto-refresh).
- `context/SessionContext.jsx`: `SessionProvider` / `useSession()` (session, user, profile, `status`, `needsOnboarding`, `isAdmin`, `signOut`).
- `context/AuthModalContext.jsx`: `useAuthModal().openAuth()` opens the sign-in modal from anywhere.
- `components/RouteGuards/RequireAuth.jsx`: layout route for signed-in-only pages.
- `components/RouteGuards/OnboardingGate.jsx`: top-level layout route that redirects to `/onboarding`.
- `pages/AuthCallback`, `pages/ResetPassword`, `pages/Onboarding`.

Env vars: copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (Dashboard → Project Settings → API Keys). Set the same two in Vercel. Never ship the secret / `service_role` key.

Locally, `supabase/config.toml` already mirrors the settings below. Emails go to Mailpit at http://127.0.0.1:54324.

---

## Dashboard settings for the hosted project

Replace `aptric.app` with the production domain and `<ref>` with the project ref.

### 1. Authentication → URL Configuration

| Setting | Value |
| --- | --- |
| Site URL | `https://aptric.app` |
| Redirect URLs | `https://aptric.app/**`<br>`http://localhost:6969/**`<br>`https://*-<vercel-team-slug>.vercel.app/**` (preview deploys; optional) |

Every `redirectTo`/`emailRedirectTo` the app sends is `<origin>/auth/callback?next=…`, so it must match an entry here or Supabase falls back to the Site URL.

### 2. Authentication → Sign In / Providers → Email

| Setting | Value |
| --- | --- |
| Enable Email provider | **On** |
| Confirm email | **On** (required: sign-up returns no session until the link is clicked) |
| Secure email change | **On** |
| Secure password change | **On** |
| Prevent use of leaked passwords | **On** (Pro plan and up) |
| Minimum password length | **8** |
| Password requirements | **Letters and digits** |
| Email OTP expiration | **3600** seconds |
| Email OTP length | 6 (unused by the UI) |

Under **Authentication → Sign In / Providers → User Signups**: Allow new users to sign up **On**, Allow manual linking **Off**, Allow anonymous sign-ins **Off**.

### 3. Authentication → Sign In / Providers → Google

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID**, type **Web application**.
   - Authorized JavaScript origins: `https://aptric.app`, `http://localhost:6969`
   - Authorized redirect URIs: `https://<ref>.supabase.co/auth/v1/callback` (the Callback URL shown on the Supabase Google provider panel; use the custom auth domain instead if you set one up).
   - OAuth consent screen scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
2. In Supabase: Enable Sign in with Google **On**, paste **Client IDs** and **Client Secret**, Skip nonce checks **Off**, Allow users without an email **Off**.

### 4. Authentication → Emails → SMTP Settings (custom SMTP)

Verify the sending domain with the provider first (SPF, DKIM and a DMARC record), and use a subdomain just for auth mail, e.g. `auth.aptric.app`. Turn **off** click/link tracking at the provider: it rewrites the one-time links and breaks them.

| Setting | Resend | Postmark |
| --- | --- | --- |
| Enable custom SMTP | On | On |
| Sender email | `no-reply@auth.aptric.app` | `no-reply@auth.aptric.app` (must be a confirmed Sender Signature/domain) |
| Sender name | `Aptric` | `Aptric` |
| Host | `smtp.resend.com` | `smtp.postmarkapp.com` |
| Port | `465` (or `587`) | `587` |
| Username | `resend` | Postmark **Server API token** |
| Password | Resend API key (`re_…`, "Sending access" scope) | the same Server API token |
| Minimum interval between emails being sent | `60` seconds | `60` seconds |

Turning custom SMTP on resets the email rate limit to 30/hour. Set it in step 6.

### 5. Authentication → Emails → Templates

Paste the matching file from `supabase/templates/` into each template, with these subjects:

| Template | Subject | Body |
| --- | --- | --- |
| Confirm signup | Confirm your Aptric email | `confirmation.html` |
| Magic link | Your Aptric sign-in link | `magic_link.html` |
| Reset password | Reset your Aptric password | `recovery.html` |
| Change email address | Confirm your new Aptric email | `email_change.html` |

The templates link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=…`. The app then calls `verifyOtp`, which works even if the link is opened in a different browser than the one that requested it. The default templates (`{{ .ConfirmationURL }}`) still work through the `?code=` path, but only in the same browser.

### 6. Authentication → Rate Limits

| Setting | Default | Set to | Why |
| --- | --- | --- | --- |
| Rate limit for sending emails (per hour, project-wide) | 30 once custom SMTP is on | **100**. Keep it at or below your provider plan's hourly allowance (Resend free plan = 100/day, so use ~4). | Covers sign-up confirmations, magic links and resets |
| Rate limit for token refreshes (per 5 min per IP) | 150 | **300** | Students on campus Wi-Fi share one NAT IP |
| Rate limit for token verifications (per 5 min per IP) | 30 | **60** | Email link/OTP verifications, same NAT reason |
| Rate limit for sign ups and sign ins (per 5 min per IP) | 30 | **60** | Same NAT reason. Still blocks credential stuffing |
| Rate limit for sending SMS messages | 30 | leave (SMS disabled) | |
| Rate limit for anonymous users | 30 | leave (anonymous sign-in disabled) | |
| Rate limit for Web3 sign-ins | 30 | leave (disabled) | |

If sign-up abuse appears, enable **Authentication → Attack Protection → CAPTCHA** (Cloudflare Turnstile). The frontend will then need to pass `options.captchaToken` to `signUp`, `signInWithPassword`, `signInWithOtp` and `resetPasswordForEmail`.

### Equivalent `config.toml` keys (local) / Management API fields (hosted)

`[auth] site_url, additional_redirect_urls, minimum_password_length, password_requirements` · `[auth.email] enable_confirmations, secure_password_change, double_confirm_changes, max_frequency` · `[auth.rate_limit] email_sent, token_refresh, token_verifications, sign_in_sign_ups` · `[auth.email.template.*]` · `[auth.external.google]`. To script the hosted project instead of clicking through the dashboard, `PATCH https://api.supabase.com/v1/projects/<ref>/config/auth` (fields such as `mailer_autoconfirm: false`, `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email`, `smtp_sender_name`, `rate_limit_email_sent`, `external_google_enabled`).
