"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type ToastContextValue = {
  toast: (message: string) => void;
  celebrate: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

const CONFETTI_COLORS = [
  "#FFC53D",
  "#FF6BA9",
  "#FF8A3D",
  "#00C16A",
  "#3E9BFF",
  "#8C6BFF",
  "#FF5A5F",
];

function fireConfetti() {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < 60; i++) {
    const d = document.createElement("div");
    d.className = "confetti";
    const s = 6 + Math.random() * 7;
    const shape =
      i % 3 === 0
        ? "clip-path:polygon(50% 0,100% 100%,0 100%);"
        : Math.random() > 0.5
          ? "border-radius:50%;"
          : "border-radius:2px;border:1.5px solid #191420;";
    d.style.cssText =
      `left:${Math.random() * 100}vw;width:${s}px;height:${s * 1.2}px;` +
      `background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};` +
      shape +
      `animation-duration:${2 + Math.random() * 1.4}s;` +
      `animation-delay:${Math.random() * 0.4}s;transform:rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4400);
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    setMessage(msg);
    setShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2400);
  }, []);

  const celebrate = useCallback(() => {
    fireConfetti();
  }, []);

  return (
    <ToastContext.Provider value={{ toast, celebrate }}>
      {children}
      <div
        aria-live="polite"
        className={cn(
          "pointer-events-none fixed inset-x-0 z-[1000] flex justify-center px-4 transition-all duration-300",
          "bottom-[max(1.5rem,env(safe-area-inset-bottom))]",
          show ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        )}
      >
        {message ? (
          <div className="pointer-events-auto max-w-[90vw] truncate rounded-[10px] border-2 border-ink bg-ink px-5 py-3 text-sm font-bold text-paper shadow-[4px_4px_0_var(--pink)]">
            {message}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
