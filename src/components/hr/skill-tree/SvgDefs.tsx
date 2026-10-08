import { BRANCHES } from '@/lib/craft-skill-paths';

// ── SVG filter definitions (glow per branch) ─────────────────────────

export function SvgDefs() {
  return (
    <defs>
      {Object.values(BRANCHES).map(b => (
        <filter
          key={b.id}
          id={`glow-${b.id}`}
          x="-60%"
          y="-60%"
          width="220%"
          height="220%"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feFlood floodColor={b.glowColor} floodOpacity="0.55" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      ))}
      {/* Subtle particle / star background */}
      <radialGradient id="bg-vignette" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stopColor="#141428" />
        <stop offset="100%" stopColor="#0a0a14" />
      </radialGradient>
    </defs>
  );
}
