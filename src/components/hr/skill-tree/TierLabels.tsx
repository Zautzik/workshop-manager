import { TIER_LABELS, VIEWBOX } from '@/lib/craft-skill-paths';

// ── Tier label bar (left side) ───────────────────────────────────────

export function TierLabels() {
  const tierYPositions: [number, number][] = [
    [0, 1020],
    [1, 860],
    [2, 700],
    [3, 540],
    [4, 380],
    [5, 200],
  ];

  return (
    <>
      {tierYPositions.map(([tier, y]) => (
        <g key={tier}>
          {/* Horizontal guide line */}
          <line
            x1={0}
            y1={y}
            x2={VIEWBOX.width}
            y2={y}
            stroke="#1e293b"
            strokeWidth={0.5}
            strokeDasharray="6 4"
            opacity={0.4}
          />
          {/* Label */}
          <text
            x={14}
            y={y - 8}
            fill="#475569"
            fontSize={10}
            fontWeight="600"
            fontFamily="system-ui, sans-serif"
          >
            {TIER_LABELS[tier]}
          </text>
        </g>
      ))}
    </>
  );
}
