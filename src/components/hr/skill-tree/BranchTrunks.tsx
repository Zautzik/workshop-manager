import { BRANCHES, type CraftBranch } from '@/lib/craft-skill-paths';

// ── Branch trunk lines (thick coloured lines from root) ──────────────

export function BranchTrunks() {
  // Thick trunk lines from foundation to craft intro nodes
  const trunks: { from: [number, number]; to: [number, number]; branch: CraftBranch }[] = [
    // Offset (via press intro)
    { from: [480, 1020], to: [250, 860], branch: 'offset_printing' },
    { from: [770, 1020], to: [250, 860], branch: 'offset_printing' },
    // Offset sub-trunk up
    { from: [250, 860], to: [140, 200], branch: 'offset_printing' },
    // Digital sub-trunk up
    { from: [250, 860], to: [365, 200], branch: 'digital_printing' },
    // Guillotine
    { from: [480, 1020], to: [590, 860], branch: 'guillotine' },
    { from: [770, 1020], to: [590, 860], branch: 'guillotine' },
    { from: [590, 860], to: [590, 200], branch: 'guillotine' },
    // Die Cutting
    { from: [480, 1020], to: [870, 860], branch: 'die_cutting' },
    { from: [630, 1020], to: [870, 860], branch: 'die_cutting' },
    { from: [870, 860], to: [870, 200], branch: 'die_cutting' },
    // Workshop
    { from: [480, 1020], to: [1150, 860], branch: 'workshop' },
    { from: [630, 1020], to: [1150, 860], branch: 'workshop' },
    { from: [920, 1020], to: [1150, 860], branch: 'workshop' },
    { from: [1150, 860], to: [1150, 200], branch: 'workshop' },
  ];

  return (
    <>
      {trunks.map((t, i) => {
        const [x1, y1] = t.from;
        const [x2, y2] = t.to;
        const midY = (y1 + y2) / 2;
        const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
        const branchInfo = BRANCHES[t.branch];
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={branchInfo.color}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.08}
          />
        );
      })}
    </>
  );
}
