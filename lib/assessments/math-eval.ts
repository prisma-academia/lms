/**
 * A small, safe maths expression engine. No `eval`, no `Function`: a tokenizer,
 * a precedence-climbing parser and a tree walker.
 *
 * Used by the CBT on-screen calculator (client) and by EQUATION / NUMERIC
 * grading (server), so a candidate's typed maths is checked with exactly the
 * rules the calculator showed them.
 *
 * Supports: + - * / ^ (right-assoc), unary minus, parentheses, implicit
 * multiplication (2x, 3(4), (a)(b), 2pi), postfix factorial `!` and percent `%`,
 * functions sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs ln log
 * (base 10) log2 exp floor ceil round, constants pi and e, and named variables.
 *
 * Pure and dependency-free so it can ship to the browser.
 */

export type AngleMode = "rad" | "deg";

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "un"; op: "-" | "+"; a: Node }
  | { k: "post"; op: "!" | "%"; a: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "(" }
  | { t: ")" }
  | { t: "," };

const FUNCTIONS = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh",
  "sqrt", "cbrt", "abs", "ln", "log", "log2", "exp", "floor", "ceil", "round",
]);
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export class MathError extends Error {}

const MAX_LEN = 500;
const MAX_DEPTH = 60;

function tokenize(src: string): Tok[] {
  if (src.length > MAX_LEN) throw new MathError("Expression is too long.");
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new MathError("Bad number.");
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      const m = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(src.slice(i))!;
      out.push(...splitIdentifier(m[0]));
      i += m[0].length;
      continue;
    }
    if ("+-*/^!%".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") out.push({ t: "(" });
    else if (c === ")") out.push({ t: ")" });
    else if (c === ",") out.push({ t: "," });
    else throw new MathError(`Unexpected "${c}".`);
    i++;
  }
  return out;
}

/**
 * "xy" with no such function means x*y; "sinx" means sin(x); "pix" means pi*x.
 * Longest known name wins at each position.
 */
function splitIdentifier(word: string): Tok[] {
  const lower = word.toLowerCase();
  if (FUNCTIONS.has(lower) || lower in CONSTANTS) return [{ t: "id", v: lower }];
  const out: Tok[] = [];
  let i = 0;
  const known = [...FUNCTIONS, ...Object.keys(CONSTANTS)].sort((a, b) => b.length - a.length);
  while (i < word.length) {
    const rest = word.slice(i).toLowerCase();
    const hit = known.find((k) => rest.startsWith(k));
    if (hit) {
      out.push({ t: "id", v: hit });
      i += hit.length;
    } else {
      // Single-letter variable (subscripted names like x_1 keep their tail).
      const m = /^[a-zA-Z](_[a-zA-Z0-9]+)?/.exec(word.slice(i));
      const name = m ? m[0] : word[i];
      out.push({ t: "id", v: name });
      i += name.length;
    }
  }
  return out;
}

/** Insert the `*` a person leaves out: 2x, 3(4), (a)(b), x y, 2pi, )x. */
function withImplicitMultiply(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    const cur = toks[i];
    const prev = out[out.length - 1];
    if (prev) {
      const prevEnds =
        prev.t === "num" || prev.t === ")" || (prev.t === "id" && !FUNCTIONS.has(prev.v)) ||
        (prev.t === "op" && (prev.v === "!" || prev.v === "%"));
      const curStarts = cur.t === "num" || cur.t === "(" || cur.t === "id";
      if (prevEnds && curStarts) out.push({ t: "op", v: "*" });
    }
    out.push(cur);
  }
  return out;
}

function parse(toks: Tok[]): Node {
  let pos = 0;
  let depth = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  const isOp = (v: string) => {
    const p = peek();
    return p?.t === "op" && p.v === v;
  };

  function primary(): Node {
    if (++depth > MAX_DEPTH) throw new MathError("Expression is nested too deeply.");
    try {
      const tk = next();
      if (!tk) throw new MathError("Expression ends too early.");
      if (tk.t === "num") return { k: "num", v: tk.v };
      if (tk.t === "(") {
        const inner = expr(0);
        if (next()?.t !== ")") throw new MathError("Missing closing bracket.");
        return inner;
      }
      if (tk.t === "op" && (tk.v === "-" || tk.v === "+")) {
        // Unary binds looser than ^ : -2^2 = -4.
        return { k: "un", op: tk.v, a: expr(PREC["^"]) };
      }
      if (tk.t === "id") {
        if (FUNCTIONS.has(tk.v)) {
          if (peek()?.t === "(") {
            next();
            const args: Node[] = [expr(0)];
            while (peek()?.t === ",") {
              next();
              args.push(expr(0));
            }
            if (next()?.t !== ")") throw new MathError("Missing closing bracket.");
            return { k: "call", fn: tk.v, args };
          }
          // sin x, sqrt 2 — the argument is the next power-level term.
          return { k: "call", fn: tk.v, args: [expr(PREC["^"])] };
        }
        if (tk.v in CONSTANTS) return { k: "num", v: CONSTANTS[tk.v] };
        return { k: "var", name: tk.v };
      }
      throw new MathError("Unexpected symbol.");
    } finally {
      depth--;
    }
  }

  function postfix(n: Node): Node {
    while (isOp("!") || isOp("%")) {
      const op = (next() as { v: string }).v as "!" | "%";
      n = { k: "post", op, a: n };
    }
    return n;
  }

  function expr(minPrec: number): Node {
    let left = postfix(primary());
    for (;;) {
      const p = peek();
      if (!p || p.t !== "op" || !(p.v in PREC)) break;
      const prec = PREC[p.v as keyof typeof PREC];
      if (prec < minPrec) break;
      next();
      const rightAssoc = p.v === "^";
      const right = expr(rightAssoc ? prec : prec + 1);
      left = { k: "bin", op: p.v as "+" | "-" | "*" | "/" | "^", a: left, b: right };
    }
    return left;
  }

  const tree = expr(0);
  if (pos !== toks.length) throw new MathError("Unexpected symbol after the expression.");
  return tree;
}

const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 4 } as const;

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new MathError("Factorial needs a whole number ≥ 0.");
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function evaluate(n: Node, vars: Record<string, number>, angle: AngleMode): number {
  const ev = (x: Node) => evaluate(x, vars, angle);
  const toRad = (x: number) => (angle === "deg" ? (x * Math.PI) / 180 : x);
  const fromRad = (x: number) => (angle === "deg" ? (x * 180) / Math.PI : x);
  switch (n.k) {
    case "num":
      return n.v;
    case "var": {
      if (!(n.name in vars)) throw new MathError(`Unknown name "${n.name}".`);
      return vars[n.name];
    }
    case "un":
      return n.op === "-" ? -ev(n.a) : ev(n.a);
    case "post":
      return n.op === "!" ? factorial(ev(n.a)) : ev(n.a) / 100;
    case "bin": {
      const a = ev(n.a);
      const b = ev(n.b);
      switch (n.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "^": return Math.pow(a, b);
      }
    }
    // falls through (unreachable)
    case "call": {
      const args = n.args.map(ev);
      const x = args[0];
      switch (n.fn) {
        case "sin": return Math.sin(toRad(x));
        case "cos": return Math.cos(toRad(x));
        case "tan": return Math.tan(toRad(x));
        case "asin": return fromRad(Math.asin(x));
        case "acos": return fromRad(Math.acos(x));
        case "atan": return fromRad(Math.atan(x));
        case "sinh": return Math.sinh(x);
        case "cosh": return Math.cosh(x);
        case "tanh": return Math.tanh(x);
        case "sqrt": return Math.sqrt(x);
        case "cbrt": return Math.cbrt(x);
        case "abs": return Math.abs(x);
        case "ln": return Math.log(x);
        case "log": return args.length > 1 ? Math.log(args[1]) / Math.log(x) : Math.log10(x);
        case "log2": return Math.log2(x);
        case "exp": return Math.exp(x);
        case "floor": return Math.floor(x);
        case "ceil": return Math.ceil(x);
        case "round": return Math.round(x);
      }
      throw new MathError(`Unknown function "${n.fn}".`);
    }
  }
}

function collectVars(n: Node, into: Set<string>) {
  switch (n.k) {
    case "var": into.add(n.name); break;
    case "un": case "post": collectVars(n.a, into); break;
    case "bin": collectVars(n.a, into); collectVars(n.b, into); break;
    case "call": n.args.forEach((a) => collectVars(a, into)); break;
  }
}

export type Compiled = { variables: string[]; evaluate: (vars?: Record<string, number>, angle?: AngleMode) => number };

/** Parse plain-text maths ("2x^2 + 3", "sqrt(2)/2"). Throws MathError. */
export function compile(src: string): Compiled {
  const tree = parse(withImplicitMultiply(tokenize(src)));
  const vars = new Set<string>();
  collectVars(tree, vars);
  return {
    variables: [...vars].sort(),
    evaluate: (v = {}, angle = "rad") => evaluate(tree, v, angle),
  };
}

/** Evaluate plain-text maths with no variables; NaN on any error. */
export function evaluateExpression(src: string, angle: AngleMode = "rad"): number {
  try {
    return compile(src).evaluate({}, angle);
  } catch {
    return NaN;
  }
}

/* ────────────────────────────── LaTeX subset ────────────────────────────── */

/** Read a `{...}` group starting at `i` (which must be "{"); returns [inner, nextIndex]. */
function readGroup(s: string, i: number): [string, number] {
  if (s[i] !== "{") {
    // \frac12 style: a single character argument.
    return [s[i] ?? "", i + 1];
  }
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}") {
      depth--;
      if (depth === 0) return [s.slice(i + 1, j), j + 1];
    }
  }
  throw new MathError("Unbalanced braces.");
}

/**
 * Turn the LaTeX a candidate types (or the KaTeX input produces) into plain
 * maths the engine understands. Covers what school and university maths
 * answers use: \frac, \dfrac, \sqrt, \sqrt[n], ^{..}, _{..} subscripts,
 * \cdot \times \div, \pi, \left( \right), \sin etc, \ln, \log.
 */
export function latexToExpression(latex: string): string {
  let s = latex.trim();
  if (s.length > MAX_LEN * 2) throw new MathError("Expression is too long.");
  s = s.replace(/^\$+|\$+$/g, "");
  s = s
    .replace(/\\left|\\right|\\displaystyle|\\,|\\;|\\!|\\ /g, "")
    .replace(/\\cdot|\\times/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\pi/g, " pi ")
    .replace(/\\(arcsin|arccos|arctan)/g, (_m, f: string) => " a" + f.slice(3) + " ")
    .replace(/\\(sinh|cosh|tanh|sin|cos|tan|ln|log|exp)/g, " $1 ")
    .replace(/\\lbrace|\\\{/g, "(")
    .replace(/\\rbrace|\\\}/g, ")")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")");

  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("\\frac", i) || s.startsWith("\\dfrac", i) || s.startsWith("\\tfrac", i)) {
      i += s.startsWith("\\frac", i) ? 5 : 6;
      while (s[i] === " ") i++;
      const [num, j] = readGroup(s, i);
      let k = j;
      while (s[k] === " ") k++;
      const [den, l] = readGroup(s, k);
      out += `((${latexToExpression(num)})/(${latexToExpression(den)}))`;
      i = l;
      continue;
    }
    if (s.startsWith("\\sqrt", i)) {
      i += 5;
      while (s[i] === " ") i++;
      let root: string | null = null;
      if (s[i] === "(") {
        // \sqrt[n]{x}: "[" was already rewritten to "(".
        const close = s.indexOf(")", i);
        if (close < 0) throw new MathError("Unbalanced brackets.");
        root = s.slice(i + 1, close);
        i = close + 1;
      }
      const [arg, j] = readGroup(s, i);
      const inner = latexToExpression(arg);
      out += root ? `((${inner})^(1/(${latexToExpression(root)})))` : `sqrt(${inner})`;
      i = j;
      continue;
    }
    if (s[i] === "_") {
      // Subscript: x_{1} → x_1 (part of the name).
      i++;
      const [sub, j] = readGroup(s, i);
      out += "_" + sub.replace(/[^a-zA-Z0-9]/g, "");
      i = j;
      continue;
    }
    if (s[i] === "\\") {
      // Any other command: drop the backslash, keep the word (e.g. \alpha → alpha).
      const m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
      if (m) {
        out += " " + m[1] + " ";
        i += m[0].length;
        continue;
      }
      i++;
      continue;
    }
    if (s[i] === "{") out += "(";
    else if (s[i] === "}") out += ")";
    else out += s[i];
    i++;
  }
  return out;
}

/** Parse LaTeX or plain maths, whichever it is. */
export function compileMath(input: string): Compiled {
  const looksLatex = /\\|\{|\}/.test(input);
  return compile(looksLatex ? latexToExpression(input) : input);
}

/**
 * Are two expressions mathematically the same? Evaluated at several random
 * points for every variable either uses (identity testing). Exact for
 * polynomials and rational functions with overwhelming probability, and good
 * enough for the trig/log answers a school paper accepts.
 */
export function equivalent(a: string, b: string, opts: { tolerance?: number; samples?: number } = {}): boolean {
  let ca: Compiled;
  let cb: Compiled;
  try {
    ca = compileMath(a);
    cb = compileMath(b);
  } catch {
    return false;
  }
  const names = [...new Set([...ca.variables, ...cb.variables])];
  const tol = opts.tolerance ?? 1e-6;
  const samples = names.length === 0 ? 1 : opts.samples ?? 7;
  // Deterministic points so grading is reproducible.
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let compared = 0;
  for (let s = 0; s < samples * 3 && compared < samples; s++) {
    const vars: Record<string, number> = {};
    for (const n of names) vars[n] = 0.5 + rand() * 2.5;
    let x: number;
    let y: number;
    try {
      x = ca.evaluate(vars);
      y = cb.evaluate(vars);
    } catch {
      return false;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const scale = Math.max(1, Math.abs(x), Math.abs(y));
    if (Math.abs(x - y) > tol * scale) return false;
    compared++;
  }
  return compared > 0;
}

/** A number as people type it: "1,234.5", "1 234", "-3.2e4", "½" is not handled. */
export function parseNumber(input: string): number | null {
  const s = input.trim().replace(/[\s,](?=\d{3}\b)/g, "").replace(/\s/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
    // Allow a simple fraction like 3/4 or an expression like sqrt(2).
    const v = evaluateExpression(s);
    return Number.isFinite(v) ? v : null;
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
