/**
 * Decorative animated background accents (drifting blobs/rings + twinkling stars).
 * Absolutely fills its nearest positioned ancestor; purely presentational.
 * Each shape is an absolutely-positioned fixed-size SVG (no distortion regardless
 * of section width). Motion is CSS-only (classes in app/globals.css) and frozen
 * under prefers-reduced-motion by the global guard.
 */
type Shape = {
  kind: "blob" | "ring" | "star";
  /** position as a percentage of the container */
  x: number;
  y: number;
  /** rendered size in px */
  size: number;
  color: string;
  opacity?: number;
  delay?: number;
};

const PRESETS: Record<string, Shape[]> = {
  hero: [
    { kind: "blob", x: 6, y: 22, size: 120, color: "var(--chart-1)", opacity: 0.25, delay: 0 },
    { kind: "ring", x: 90, y: 68, size: 84, color: "var(--chart-2)", delay: -4 },
    { kind: "star", x: 80, y: 12, size: 30, color: "var(--chart-3)", delay: -1 },
    { kind: "star", x: 14, y: 82, size: 22, color: "var(--chart-4)", delay: -2.2 },
  ],
  cta: [
    { kind: "star", x: 8, y: 24, size: 28, color: "var(--foreground)", delay: 0 },
    { kind: "ring", x: 88, y: 30, size: 70, color: "var(--foreground)", opacity: 0.4, delay: -3 },
    { kind: "star", x: 86, y: 80, size: 22, color: "var(--foreground)", delay: -1.5 },
    { kind: "blob", x: 18, y: 76, size: 90, color: "var(--foreground)", opacity: 0.1, delay: -5 },
  ],
  tenant: [
    { kind: "star", x: 10, y: 16, size: 24, color: "var(--chart-3)", delay: 0 },
    { kind: "ring", x: 86, y: 20, size: 64, color: "var(--chart-4)", opacity: 0.4, delay: -2.5 },
    { kind: "blob", x: 88, y: 84, size: 96, color: "var(--chart-2)", opacity: 0.22, delay: -4 },
    { kind: "star", x: 14, y: 84, size: 20, color: "var(--chart-5)", delay: -1.2 },
  ],
};

function ShapeSvg({ shape }: { shape: Shape }) {
  const common = {
    className:
      shape.kind === "star" ? "anim-twinkle size-full" : "anim-drift size-full",
    style: { animationDelay: `${shape.delay ?? 0}s` },
  };
  if (shape.kind === "blob") {
    return (
      <svg viewBox="0 0 100 100" {...common} fill="none">
        <circle cx="50" cy="50" r="48" fill={shape.color} opacity={shape.opacity ?? 0.3} />
      </svg>
    );
  }
  if (shape.kind === "ring") {
    return (
      <svg viewBox="0 0 100 100" {...common} fill="none">
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={shape.color}
          strokeWidth="4"
          opacity={shape.opacity ?? 0.4}
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" {...common} fill="none">
      <path
        d="M50 4 L61 39 L96 39 L68 60 L79 96 L50 74 L21 96 L32 60 L4 39 L39 39 Z"
        fill={shape.color}
      />
    </svg>
  );
}

export function Decor({
  preset = "hero",
  className = "",
}: {
  preset?: keyof typeof PRESETS;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
    >
      {PRESETS[preset].map((sh, i) => (
        <span
          key={i}
          className="absolute block"
          style={{
            left: `${sh.x}%`,
            top: `${sh.y}%`,
            width: sh.size,
            height: sh.size,
            transform: "translate(-50%, -50%)",
          }}
        >
          <ShapeSvg shape={sh} />
        </span>
      ))}
    </div>
  );
}
