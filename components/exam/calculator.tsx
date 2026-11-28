"use client";

import { useState } from "react";
import { compile, type AngleMode } from "@/lib/assessments/math-eval";
import { cn } from "@/lib/utils";

/**
 * The on-screen calculator. Uses the same expression engine as EQUATION and
 * NUMERIC grading — no `eval`, no network — so it works offline and inside
 * Safe Exam Browser, where the system calculator is blocked.
 */

type Key = { label: string; insert?: string; action?: "clear" | "back" | "equals" | "ans" | "angle"; wide?: boolean; tone?: "op" | "fn" | "eq" };

const BASIC: Key[][] = [
  [{ label: "C", action: "clear", tone: "fn" }, { label: "⌫", action: "back", tone: "fn" }, { label: "(", insert: "(" }, { label: ")", insert: ")" }],
  [{ label: "7", insert: "7" }, { label: "8", insert: "8" }, { label: "9", insert: "9" }, { label: "÷", insert: "/", tone: "op" }],
  [{ label: "4", insert: "4" }, { label: "5", insert: "5" }, { label: "6", insert: "6" }, { label: "×", insert: "*", tone: "op" }],
  [{ label: "1", insert: "1" }, { label: "2", insert: "2" }, { label: "3", insert: "3" }, { label: "−", insert: "-", tone: "op" }],
  [{ label: "0", insert: "0" }, { label: ".", insert: "." }, { label: "%", insert: "%" }, { label: "+", insert: "+", tone: "op" }],
  [{ label: "Ans", action: "ans", tone: "fn" }, { label: "=", action: "equals", wide: true, tone: "eq" }],
];

const SCIENTIFIC_EXTRA: Key[][] = [
  [{ label: "sin", insert: "sin(", tone: "fn" }, { label: "cos", insert: "cos(", tone: "fn" }, { label: "tan", insert: "tan(", tone: "fn" }, { label: "DEG", action: "angle", tone: "fn" }],
  [{ label: "sin⁻¹", insert: "asin(", tone: "fn" }, { label: "cos⁻¹", insert: "acos(", tone: "fn" }, { label: "tan⁻¹", insert: "atan(", tone: "fn" }, { label: "π", insert: "pi" }],
  [{ label: "xʸ", insert: "^", tone: "op" }, { label: "x²", insert: "^2", tone: "op" }, { label: "√", insert: "sqrt(", tone: "fn" }, { label: "e", insert: "e" }],
  [{ label: "ln", insert: "ln(", tone: "fn" }, { label: "log", insert: "log(", tone: "fn" }, { label: "n!", insert: "!", tone: "op" }, { label: "|x|", insert: "abs(", tone: "fn" }],
];

function format(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "∞" : n < 0 ? "−∞" : "Error";
  if (Math.abs(n) >= 1e12 || (Math.abs(n) < 1e-9 && n !== 0)) return n.toExponential(8).replace(/\.?0+e/, "e");
  return String(Math.round(n * 1e10) / 1e10);
}

export function Calculator({ scientific }: { scientific: boolean }) {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string>("0");
  const [ans, setAns] = useState(0);
  const [angle, setAngle] = useState<AngleMode>("deg");
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);

  function press(k: Key) {
    if (k.action === "clear") {
      setExpr("");
      setResult("0");
      return;
    }
    if (k.action === "back") return setExpr((e) => e.slice(0, -1));
    if (k.action === "angle") return setAngle((a) => (a === "deg" ? "rad" : "deg"));
    if (k.action === "ans") return setExpr((e) => e + "ans");
    if (k.action === "equals") return evaluate();
    setExpr((e) => e + (k.insert ?? ""));
  }

  function evaluate() {
    if (!expr.trim()) return;
    try {
      const value = compile(expr.replace(/ans/g, `(${ans})`)).evaluate({}, angle);
      const shown = format(value);
      setResult(shown);
      if (Number.isFinite(value)) setAns(value);
      setHistory((h) => [{ expr, result: shown }, ...h].slice(0, 8));
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Error");
    }
  }

  const rows = scientific ? [...SCIENTIFIC_EXTRA, ...BASIC] : BASIC;
  return (
    <div className="flex w-full max-w-xs flex-col gap-2" data-allow-select>
      <div className="rounded-[10px] border-2 border-border bg-[#0f172a] px-3 py-2 text-right text-slate-100">
        <input
          aria-label="Calculation"
          value={expr}
          onChange={(e) => setExpr(e.target.value.replace(/[^0-9a-z+\-*/^().,!% ]/gi, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              evaluate();
            }
          }}
          className="w-full bg-transparent text-right font-mono text-sm text-slate-300 outline-none"
          placeholder="0"
        />
        <div className="num truncate text-2xl font-black" aria-live="polite">
          {result}
        </div>
        {scientific ? <div className="text-[10px] font-bold uppercase text-slate-400">{angle}</div> : null}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {rows.flat().map((k, i) => (
          <button
            key={`${k.label}-${i}`}
            type="button"
            onClick={() => press(k)}
            className={cn(
              "min-h-11 rounded-[8px] border-2 border-border text-sm font-black outline-none [touch-action:manipulation] focus-visible:outline-[3px] focus-visible:outline-ring active:translate-y-px",
              k.wide && "col-span-3",
              k.tone === "eq" ? "bg-primary text-primary-foreground" : k.tone === "op" ? "bg-muted" : k.tone === "fn" ? "bg-secondary text-secondary-foreground" : "bg-card"
            )}
          >
            {k.action === "angle" ? angle.toUpperCase() : k.label}
          </button>
        ))}
      </div>
      {history.length ? (
        <ul className="max-h-24 overflow-y-auto text-right font-mono text-xs text-muted-foreground">
          {history.map((h, i) => (
            <li key={i}>
              {h.expr} = <span className="font-black text-foreground">{h.result}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
