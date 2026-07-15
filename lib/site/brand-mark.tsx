/**
 * Shared neo-brutalist "prism" brand mark for favicon / apple-icon / OG image
 * generation via `next/og`.
 *
 * Concept: a beam of white light (knowledge) enters a prism and refracts into
 * the brand spectrum — yellow, pink, blue. It literally draws the product name
 * ("Prisma") and matches the flat-color, thick-ink-outline house style.
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
        {/* incoming beam of light */}
        <path
          d="M12 50 H40"
          fill="none"
          stroke={BRAND.ink}
          strokeWidth={7}
          strokeLinecap="round"
        />
        {/* the prism */}
        <path
          d="M50 20 78 72 22 72Z"
          fill={BRAND.card}
          stroke={BRAND.ink}
          strokeWidth={6}
          strokeLinejoin="round"
        />
        {/* refracted spectrum */}
        <path d="M62 52 90 40" fill="none" stroke={BRAND.yellow} strokeWidth={7} strokeLinecap="round" />
        <path d="M63 58 92 58" fill="none" stroke={BRAND.pink} strokeWidth={7} strokeLinecap="round" />
        <path d="M62 64 90 76" fill="none" stroke={BRAND.blue} strokeWidth={7} strokeLinecap="round" />
      </g>
    </svg>
  );
}
