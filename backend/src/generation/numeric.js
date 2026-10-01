// Computed check for numeric quant questions: a small, safe arithmetic
// evaluator (no eval, no variables) plus parsing of numeric option text.
export class ExprError extends Error {
}
const MAX_EXPR_LENGTH = 500;
function tokenize(src) {
  const s = src
    .replace(/[×✕∗·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/\*\*/g, '^');
  const re = /\s+|((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)|([a-zA-Z_][a-zA-Z0-9_]*)|([-+*/^(),])/y;
  const tokens = [];
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m)
      throw new ExprError(`unexpected character '${s[pos]}'`);
    pos = re.lastIndex;
    if (m[1] !== undefined)
      tokens.push({ kind: 'num', value: Number(m[1]) });
    else if (m[2] !== undefined)
      tokens.push({ kind: 'id', value: m[2].toLowerCase() });
    else if (m[3] !== undefined)
      tokens.push({ kind: 'op', value: m[3] });
  }
  return tokens;
}
function integerArg(x, name, max) {
  if (!Number.isInteger(x) || x < 0 || x > max)
    throw new ExprError(`${name} needs an integer in 0..${max}`);
  return x;
}
function factorial(n) {
  integerArg(n, 'fact', 170);
  let r = 1;
  for (let i = 2; i <= n; i++)
    r *= i;
  return r;
}
function nPr(n, r) {
  integerArg(n, 'nPr', 10_000);
  integerArg(r, 'nPr', n);
  let p = 1;
  for (let i = 0; i < r; i++)
    p *= n - i;
  return p;
}
function nCr(n, r) {
  integerArg(n, 'nCr', 10_000);
  integerArg(r, 'nCr', n);
  r = Math.min(r, n - r);
  let c = 1;
  for (let i = 1; i <= r; i++)
    c = (c * (n - r + i)) / i;
  return Math.round(c);
}
function gcd(a, b) {
  integerArg(Math.abs(a), 'gcd', Number.MAX_SAFE_INTEGER);
  integerArg(Math.abs(b), 'gcd', Number.MAX_SAFE_INTEGER);
  a = Math.abs(a);
  b = Math.abs(b);
  while (b)
    [a, b] = [b, a % b];
  return a;
}
const FUNCTIONS = {
  sqrt: { arity: [1], fn: Math.sqrt },
  cbrt: { arity: [1], fn: Math.cbrt },
  abs: { arity: [1], fn: Math.abs },
  ln: { arity: [1], fn: Math.log },
  log10: { arity: [1], fn: Math.log10 },
  log2: { arity: [1], fn: Math.log2 },
  log: { arity: [2], fn: (x, base) => Math.log(x) / Math.log(base) },
  exp: { arity: [1], fn: Math.exp },
  pow: { arity: [2], fn: Math.pow },
  floor: { arity: [1], fn: Math.floor },
  ceil: { arity: [1], fn: Math.ceil },
  round: { arity: [1, 2], fn: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d },
  min: { arity: [2, 3, 4, 5, 6, 7, 8], fn: Math.min },
  max: { arity: [2, 3, 4, 5, 6, 7, 8], fn: Math.max },
  fact: { arity: [1], fn: factorial },
  ncr: { arity: [2], fn: nCr },
  npr: { arity: [2], fn: nPr },
  gcd: { arity: [2], fn: gcd },
  lcm: { arity: [2], fn: (a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b)) },
};
const CONSTANTS = { pi: Math.PI, e: Math.E };
// Grammar (^ is right-associative and binds tighter than unary minus, so
// -2^2 = -4 and 2^-1 = 0.5; implicit multiplication is not allowed):
//   expr  := term (('+' | '-') term)*
//   term  := unary (('*' | '/') unary)*
//   unary := ('-' | '+') unary | power
//   power := primary ('^' unary)?
//   primary := number | constant | name '(' expr (',' expr)* ')' | '(' expr ')'
export function evaluate(src) {
  if (src.length > MAX_EXPR_LENGTH)
    throw new ExprError('expression too long');
  const tokens = tokenize(src);
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (v) => peek()?.kind === 'op' && peek().value === v;
  const expect = (v) => {
    if (!isOp(v))
      throw new ExprError(`expected '${v}'`);
    i++;
  };
  const expr = () => {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[i++].value;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const term = () => {
    let v = unary();
    while (isOp('*') || isOp('/')) {
      const op = tokens[i++].value;
      const r = unary();
      if (op === '/' && r === 0)
        throw new ExprError('division by zero');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const unary = () => {
    if (isOp('-')) {
      i++;
      return -unary();
    }
    if (isOp('+')) {
      i++;
      return unary();
    }
    return power();
  };
  const power = () => {
    const base = primary();
    if (isOp('^')) {
      i++;
      return Math.pow(base, unary());
    }
    return base;
  };
  const primary = () => {
    const t = peek();
    if (!t)
      throw new ExprError('unexpected end of expression');
    if (t.kind === 'num') {
      i++;
      return t.value;
    }
    if (t.kind === 'op' && t.value === '(') {
      i++;
      const v = expr();
      expect(')');
      return v;
    }
    if (t.kind === 'id') {
      i++;
      if (isOp('(')) {
        const f = FUNCTIONS[t.value];
        if (!f)
          throw new ExprError(`unknown function '${t.value}'`);
        i++;
        const args = [expr()];
        while (isOp(',')) {
          i++;
          args.push(expr());
        }
        expect(')');
        if (!f.arity.includes(args.length))
          throw new ExprError(`${t.value} takes ${f.arity.join(' or ')} arguments`);
        return f.fn(...args);
      }
      if (t.value in CONSTANTS)
        return CONSTANTS[t.value];
      throw new ExprError(`unknown name '${t.value}'`);
    }
    throw new ExprError(`unexpected '${t.value}'`);
  };
  if (tokens.length === 0)
    throw new ExprError('empty expression');
  const value = expr();
  if (i !== tokens.length)
    throw new ExprError(`unexpected '${tokens[i].value}'`);
  if (!Number.isFinite(value))
    throw new ExprError('result is not a finite number');
  return value;
}
// A number, optionally a fraction ("3/4") or mixed number ("2 1/2"), with
// currency before it and only a unit after it ("₹1,250", "12.5%", "45 km/h").
// Anything else ("2 hours 30 minutes", "x = 5", "None of these") is null.
export function parseOptionNumber(text) {
  let s = text
    .replace(/[−–]/g, '-')
    .replace(/\\?\$|₹|€|£|\bRs\.?|\bINR\b|\bUSD\b/gi, ' ')
    .replace(/(\d),(?=\d)/g, '$1')
    .trim();
  s = s.replace(/^-\s+/, '-');
  const m = /^(-?\d+(?:\.\d+)?)(?:\s+(\d+)\s*\/\s*(\d+)|\s*\/\s*(\d+(?:\.\d+)?))?\s*([\p{L}%°²³\s./]*)$/u.exec(s);
  if (!m)
    return null;
  const [, whole, mixNum, mixDen, den, unit] = m;
  if (/\d/.test(unit))
    return null;
  const main = Number(whole);
  if (mixNum !== undefined) {
    if (Number(mixDen) === 0)
      return null;
    const frac = Number(mixNum) / Number(mixDen);
    return { value: main < 0 || whole.startsWith('-') ? main - frac : main + frac, decimals: null };
  }
  if (den !== undefined) {
    if (Number(den) === 0)
      return null;
    return { value: main / Number(den), decimals: null };
  }
  const dot = whole.indexOf('.');
  return { value: main, decimals: dot === -1 ? 0 : whole.length - dot - 1 };
}
const APPROXIMATE = /\b(approx(imate(ly)?)?|nearest|rounded|round(ed)? off|closest)\b|≈/i;
// Does `value` match the option as written? Fractions must match exactly; a
// value shown with 2+ decimals (or any option when the stem asks for an
// approximate answer) matches anything that rounds to it; otherwise near-exact.
export function matchesOption(value, opt, approximate) {
  const scale = Math.max(1, Math.abs(opt.value));
  if (opt.decimals === null)
    return Math.abs(value - opt.value) <= 1e-9 * scale;
  if (approximate || opt.decimals >= 2) {
    return Math.abs(value - opt.value) <= 0.5 * 10 ** -opt.decimals + 1e-9 * scale;
  }
  return Math.abs(value - opt.value) <= 1e-6 * scale;
}
// Numeric question = every option parses as a number. For those, `computation`
// must evaluate to the keyed option's value and to no other option's.
export function numericCheck(q, computation) {
  const parsed = q.options.map(parseOptionNumber);
  if (parsed.some((p) => p === null))
    return { applicable: false };
  const opts = parsed;
  if (!computation)
    return { applicable: true, ok: false, reason: 'no computation for a numeric question' };
  let value;
  try {
    value = evaluate(computation);
  }
  catch (err) {
    return { applicable: true, ok: false, reason: `computation: ${err.message}` };
  }
  const approximate = APPROXIMATE.test(q.stem);
  const matching = opts.flatMap((o, i) => (matchesOption(value, o, approximate) ? [i] : []));
  if (!matching.includes(q.correct_index)) {
    return { applicable: true, ok: false, reason: `computation gives ${value}, keyed option is ${q.options[q.correct_index]}` };
  }
  if (matching.length > 1) {
    return { applicable: true, ok: false, reason: `computation gives ${value}, which matches ${matching.length} options` };
  }
  return { applicable: true, ok: true, value };
}
