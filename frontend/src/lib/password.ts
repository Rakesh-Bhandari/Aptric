// Client-side hint only. Supabase Auth enforces the real password policy.
export const passwordStrength = (pwd: string) => {
  let points = 0;
  if (pwd.length >= 8) points++;
  if (pwd.length >= 12) points++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) points++;
  if (/\d/.test(pwd)) points++;
  if (/[^A-Za-z0-9]/.test(pwd)) points++;
  if (pwd.length < 8) return { score: pwd ? 1 : 0, label: 'too short', color: 'bg-danger' };
  if (points <= 2) return { score: 1, label: 'weak', color: 'bg-danger' };
  if (points === 3) return { score: 2, label: 'okay', color: 'bg-warning' };
  if (points === 4) return { score: 3, label: 'good', color: 'bg-success' };
  return { score: 4, label: 'strong', color: 'bg-success' };
};
