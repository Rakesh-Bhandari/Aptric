// Plain-language messages for errors from the API (SQL functions and auth).

interface MaybeError {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

export const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null ? (error as MaybeError).code : undefined;

const isNetworkError = (error: unknown) => {
  const message = typeof error === 'object' && error !== null ? (error as MaybeError).message ?? '' : String(error);
  return /failed to fetch|network ?error|load failed|networkerror/i.test(message);
};

/** Game and data errors (SQLSTATE codes raised by the SQL functions). */
export const friendlyError = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (isNetworkError(error)) return "We couldn't reach the server. Check your connection and try again.";
  switch (errorCode(error)) {
    case '23505': return "You've already answered this question.";
    case '42501': return "This isn't available to you right now.";
    case 'P0002': return "We couldn't find that. It may not be ready yet.";
    case '22023': return "That answer couldn't be sent. Please try again.";
    case '55000': return "That isn't open right now.";
    case '23514': return 'That value is not allowed.';
    case '401':
    case 'refresh_token_not_found': return 'Your session has expired. Please sign in again.';
    case 'over_request_rate_limit': return 'Too many requests. Please wait a minute and try again.';
    default: return fallback;
  }
};

/** Errors from the API's /auth routes. */
export const authErrorMessage = (error: unknown): string => {
  if (isNetworkError(error)) return "We couldn't reach the server. Check your connection and try again.";
  switch (errorCode(error)) {
    case 'invalid_credentials': return 'That email and password don’t match. Try again or reset your password.';
    case 'email_not_confirmed': return 'Please confirm your email first. Check your inbox for the link.';
    case 'weak_password': return 'Please choose a stronger password: at least 8 characters with letters and numbers.';
    case 'validation_failed': return 'Please enter a valid email address.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'Too many attempts. Please wait a minute and try again.';
    case 'otp_expired': return 'This link has expired or was already used. Please request a new one.';
    case 'refresh_token_not_found':
    case '401': return 'Your session has expired. Please sign in again.';
    case 'user_banned': return 'This account has been suspended.';
    case 'reauthentication_needed': return 'For your security, please sign in again before changing your password.';
    default: return 'Something went wrong. Please try again.';
  }
};
