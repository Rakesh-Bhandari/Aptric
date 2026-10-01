// Client-side hints only. Supabase Auth enforces the real policy
// (min length + character classes) and rejects weak passwords itself.
export const getPasswordStrength = (pwd) => {
    if (!pwd) return null;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 2) return { label: 'SIMPLE', level: 1 };
    if (score === 3) return { label: 'HARD', level: 2 };
    if (score === 4 || score === 5) return { label: 'STRONG', level: 3 };
    return { label: 'VERY STRONG', level: 4 };
};

const pick = (chars) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length];

export const generatePassword = () => {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const all = upper + lower + digits + symbols;

    const pwd = [pick(upper), pick(lower), pick(digits), pick(symbols)];
    while (pwd.length < 16) pwd.push(pick(all));
    // Fisher-Yates so the guaranteed characters aren't always first.
    for (let i = pwd.length - 1; i > 0; i--) {
        const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
        [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
    }
    return pwd.join('');
};

// Map Supabase Auth error codes to copy for the UI.
export const authErrorMessage = (error) => {
    switch (error?.code) {
        case 'invalid_credentials': return 'Email or password is incorrect.';
        case 'email_not_confirmed': return 'Confirm your email first — check your inbox for the link.';
        case 'weak_password': return 'Password is too weak. Use at least 8 characters with letters and digits.';
        case 'same_password': return 'New password must be different from the old one.';
        case 'over_email_send_rate_limit':
        case 'over_request_rate_limit': return 'Too many attempts. Wait a minute and try again.';
        case 'otp_expired': return 'This link has expired or was already used. Request a new one.';
        case 'signup_disabled': return 'New sign-ups are currently disabled.';
        case 'user_banned': return 'This account is suspended.';
        case 'reauthentication_needed': return 'For security, sign in again before changing your password.';
        default: return error?.message || 'Something went wrong. Please try again.';
    }
};
