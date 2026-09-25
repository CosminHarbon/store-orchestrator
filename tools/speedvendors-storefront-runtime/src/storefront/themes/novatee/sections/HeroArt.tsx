// EDITABLE decorative hero artwork (presentation only — not catalog/commerce).
/** Two overlapping tee silhouettes with abstract prints. */

function TeeSvg({
  className,
  bg,
  a,
  b,
  ink,
  style,
}: {
  className?: string;
  bg: string;
  a: string;
  b: string;
  ink: string;
  style: 'orbit' | 'waves';
}) {
  const gid = style;
  return (
    <svg className={className} viewBox="0 0 400 440" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={`${gid}-grad`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
        <linearGradient id={`${gid}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".1" />
          <stop offset=".6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".18" />
        </linearGradient>
        <filter id={`${gid}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#000" floodOpacity=".35" />
        </filter>
      </defs>
      <g filter={`url(#${gid}-shadow)`}>
        <path
          d="M140 40 60 80 18 172l64 26 18-30v236q0 10 10 10h180q10 0 10-10V168l18 30 64-26-42-92-80-40q-10 38-60 38t-60-38z"
          fill={bg}
        />
        <path
          d="M140 40 60 80 18 172l64 26 18-30v236q0 10 10 10h180q10 0 10-10V168l18 30 64-26-42-92-80-40q-10 38-60 38t-60-38z"
          fill={`url(#${gid}-shade)`}
        />
      </g>
      <path
        d="M140 40q10 38 60 38t60-38"
        fill="none"
        stroke={ink}
        strokeOpacity=".35"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {style === 'orbit' ? (
        <>
          <circle cx="200" cy="190" r="26" fill={`url(#${gid}-grad)`} />
          <ellipse
            cx="200"
            cy="190"
            rx="66"
            ry="24"
            fill="none"
            stroke={ink}
            strokeWidth="2.5"
            transform="rotate(0 200 190)"
            opacity=".85"
          />
          <ellipse
            cx="200"
            cy="190"
            rx="66"
            ry="24"
            fill="none"
            stroke={ink}
            strokeWidth="2.5"
            transform="rotate(60 200 190)"
            opacity=".85"
          />
          <ellipse
            cx="200"
            cy="190"
            rx="66"
            ry="24"
            fill="none"
            stroke={ink}
            strokeWidth="2.5"
            transform="rotate(120 200 190)"
            opacity=".85"
          />
          <circle cx="262" cy="190" r="6" fill={b} />
          <circle cx="147" cy="220" r="5" fill={a} />
        </>
      ) : (
        [0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M138 ${140 + i * 24} q 15 -22 31 0 t 31 0 t 31 0 t 31 0`}
            fill="none"
            stroke={`url(#${gid}-grad)`}
            strokeWidth={7 - i}
            strokeLinecap="round"
            opacity={1 - i * 0.13}
          />
        ))
      )}
    </svg>
  );
}

export default function HeroArt() {
  return (
    <div className="sf-hero__art" aria-hidden="true">
      <TeeSvg
        className="sf-hero__tee sf-hero__tee--back"
        bg="#14151c"
        a="#22d3ee"
        b="#c6ff3d"
        ink="#f4f4f6"
        style="waves"
      />
      <TeeSvg
        className="sf-hero__tee sf-hero__tee--front"
        bg="#efeae0"
        a="#ff4d6d"
        b="#7c3aed"
        ink="#14141a"
        style="orbit"
      />
    </div>
  );
}
