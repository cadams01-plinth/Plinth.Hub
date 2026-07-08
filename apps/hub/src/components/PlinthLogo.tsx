/**
 * The Plinth Resource lockup — bowstring bridge on navy: gold arch and deck,
 * grey hangers, white piers on blue bearing pads, "PLINTH | RESOURCE".
 * Single source of truth for the brand mark (also mirrored in icon.svg).
 */
export function PlinthBridge({ height = 40 }: { height?: number }) {
  return (
    <svg
      viewBox="0 0 320 120"
      height={height}
      role="img"
      aria-label="Plinth Resource"
      style={{ display: 'block' }}
    >
      <rect x="0" y="0" width="320" height="120" rx="14" fill="var(--navy, #0d1f3d)" />
      {/* hangers */}
      {[80, 112, 144, 176, 208, 240].map((x, i) => (
        <line
          key={x}
          x1={x}
          y1={[38, 30, 26, 26, 30, 38][i]}
          x2={x}
          y2={62}
          stroke="#b9c0cc"
          strokeWidth="3"
        />
      ))}
      {/* arch */}
      <path
        d="M 44 52 Q 160 8 276 52"
        fill="none"
        stroke="#e0a526"
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* deck */}
      <rect x="24" y="62" width="272" height="7" rx="3.5" fill="#e0a526" />
      {/* piers */}
      <rect x="52" y="40" width="13" height="40" rx="3" fill="#f4f5f7" />
      <rect x="255" y="40" width="13" height="40" rx="3" fill="#f4f5f7" />
      {/* bearing pads */}
      <rect x="42" y="80" width="34" height="13" rx="3" fill="#3d6bb3" />
      <rect x="245" y="80" width="34" height="13" rx="3" fill="#3d6bb3" />
      {/* wordmark */}
      <text
        x="44"
        y="108"
        fontFamily="Verdana, Geneva, DejaVu Sans, sans-serif"
        fontSize="17"
        fontWeight="700"
        letterSpacing="6"
        fill="#e0a526"
      >
        PLINTH
      </text>
      <text
        x="172"
        y="108"
        fontFamily="Verdana, Geneva, DejaVu Sans, sans-serif"
        fontSize="15"
        fontWeight="400"
        letterSpacing="3"
        fill="#c8ccd4"
      >
        | RESOURCE
      </text>
    </svg>
  )
}

/** Compact text lockup for headers where the full mark is too tall. */
export function PlinthWordmark() {
  return (
    <span className="lockup" aria-label="Plinth Resource">
      <span className="lockup-plinth">PLINTH</span>
      <span className="lockup-divider">|</span>
      <span className="lockup-resource">RESOURCE</span>
    </span>
  )
}
