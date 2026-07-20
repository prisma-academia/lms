/**
 * Hero illustration — a neo-brutalist "course card" scene rendered as inline SVG.
 * Motion is pure CSS (classes defined in app/globals.css), so this stays a
 * server component and is automatically frozen under prefers-reduced-motion by
 * the global guard in globals.css.
 */
export function HeroArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 380"
      role="img"
      aria-label="Illustration of an online course with lessons and progress"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* drifting background blobs */}
      <g aria-hidden="true">
        <circle
          className="anim-drift"
          cx="60"
          cy="70"
          r="34"
          fill="var(--chart-1)"
          opacity="0.35"
        />
        <circle
          className="anim-drift"
          style={{ animationDelay: "-5s" }}
          cx="368"
          cy="300"
          r="42"
          fill="var(--chart-2)"
          opacity="0.3"
        />
      </g>

      {/* main course card (shadow + panel) */}
      <g className="anim-float">
        <rect x="72" y="72" width="228" height="262" rx="16" fill="var(--foreground)" />
        <rect
          x="65"
          y="65"
          width="228"
          height="262"
          rx="16"
          fill="var(--card)"
          stroke="var(--foreground)"
          strokeWidth="3"
        />

        {/* thumbnail with play button */}
        <rect x="83" y="83" width="192" height="96" rx="10" fill="var(--chart-2)" />
        <rect
          x="83"
          y="83"
          width="192"
          height="96"
          rx="10"
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="3"
        />
        <circle
          cx="179"
          cy="131"
          r="22"
          fill="var(--card)"
          stroke="var(--foreground)"
          strokeWidth="3"
        />
        <path d="M173 121 L191 131 L173 141 Z" fill="var(--foreground)" />

        {/* title + text lines */}
        <rect x="83" y="196" width="150" height="12" rx="6" fill="var(--foreground)" />
        <rect x="83" y="216" width="192" height="8" rx="4" fill="var(--border)" />
        <rect x="83" y="230" width="168" height="8" rx="4" fill="var(--border)" />

        {/* progress bar */}
        <rect
          x="83"
          y="256"
          width="192"
          height="16"
          rx="8"
          fill="var(--card)"
          stroke="var(--foreground)"
          strokeWidth="3"
        />
        <rect x="86" y="259" width="118" height="10" rx="5" fill="var(--chart-3)" />

        {/* animated progress underline */}
        <path
          className="anim-draw"
          style={{ ["--draw-len" as string]: "192" }}
          d="M83 292 H275"
          stroke="var(--chart-4)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <rect x="83" y="304" width="96" height="8" rx="4" fill="var(--border)" />
      </g>

      {/* floating graduation-cap badge */}
      <g
        className="anim-float"
        style={{ animationDelay: "-1.4s" }}
        transform="translate(300 60)"
      >
        <rect x="6" y="6" width="64" height="64" rx="14" fill="var(--foreground)" />
        <rect
          x="0"
          y="0"
          width="64"
          height="64"
          rx="14"
          fill="var(--chart-5)"
          stroke="var(--foreground)"
          strokeWidth="3"
        />
        <g className="anim-wiggle" transform="translate(32 32)">
          <path
            d="M-18 -4 L0 -13 L18 -4 L0 5 Z"
            fill="var(--foreground)"
          />
          <path
            d="M-11 0 L-11 9 Q0 16 11 9 L11 0"
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M18 -4 V7" stroke="var(--foreground)" strokeWidth="3" strokeLinecap="round" />
        </g>
      </g>

      {/* floating check badge */}
      <g
        className="anim-float"
        style={{ animationDelay: "-2.6s" }}
        transform="translate(38 250)"
      >
        <circle cx="30" cy="30" r="26" fill="var(--foreground)" />
        <circle
          cx="26"
          cy="26"
          r="26"
          fill="var(--chart-3)"
          stroke="var(--foreground)"
          strokeWidth="3"
        />
        <path
          d="M16 26 L23 33 L37 19"
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* twinkling sparkles */}
      <g aria-hidden="true" fill="var(--foreground)">
        <path
          className="anim-twinkle"
          d="M330 200 l4 8 8 4 -8 4 -4 8 -4 -8 -8 -4 8 -4 z"
        />
        <path
          className="anim-twinkle"
          style={{ animationDelay: "-0.9s" }}
          d="M42 150 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3 z"
        />
        <path
          className="anim-twinkle"
          style={{ animationDelay: "-1.7s" }}
          d="M360 130 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3 z"
        />
      </g>
    </svg>
  );
}
