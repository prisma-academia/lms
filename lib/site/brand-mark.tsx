/**
 * Shared neo-brutalist graduation-cap mark (from design.html) for
 * favicon / apple-icon / OG image generation via `next/og`.
 */

export const BRAND = {
  paper: "#faf1e4",
  card: "#fffdf6",
  ink: "#191420",
  yellow: "#ffc53d",
  pink: "#ff6ba9",
  blue: "#3e9bff",
} as const;

type MarkProps = {
  size: number;
  radius?: number;
  stroke?: number;
};

/** Square app icon: yellow tile + cap glyph. */
export function BrandMark({ size, radius = 22, stroke = 6 }: MarkProps) {
  const s = size;
  const pad = (3 / 100) * s;
  const inner = s - pad * 2;
  const r = (radius / 100) * s;
  const sw = (stroke / 100) * s;

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x={pad}
        y={pad}
        width={inner}
        height={inner}
        rx={r}
        fill={BRAND.yellow}
        stroke={BRAND.ink}
        strokeWidth={sw}
      />
      <g transform={`translate(${s * 0.5} ${s * 0.5}) scale(${s / 100}) translate(-50 -50)`}>
        <path d="M50 26 84 43 50 60 16 43Z" fill={BRAND.ink} />
        <path
          d="M32 51v15c0 6 8 10 18 10s18-4 18-10V51"
          fill="none"
          stroke={BRAND.ink}
          strokeWidth={6}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
