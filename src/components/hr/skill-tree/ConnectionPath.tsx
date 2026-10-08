import { BRANCHES, type CraftBranch, type SkillNodeDef } from '@/lib/craft-skill-paths';
import { NODE_R, MASTER_R } from './constants';

// ── Curved path between two nodes ────────────────────────────────────

export function ConnectionPath({
  fromNode,
  toNode,
  branch,
  state,
}: {
  fromNode: SkillNodeDef;
  toNode: SkillNodeDef;
  branch: CraftBranch;
  state: 'active' | 'inactive';
}) {
  const branchInfo = BRANCHES[branch];
  const r1 = fromNode.tier === 5 ? MASTER_R : NODE_R;
  const r2 = toNode.tier === 5 ? MASTER_R : NODE_R;

  const x1 = fromNode.x;
  const y1 = fromNode.y - r1;
  const x2 = toNode.x;
  const y2 = toNode.y + r2;
  const midY = (y1 + y2) / 2;

  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  const color = state === 'active' ? branchInfo.color : '#1e293b';
  const opacity = state === 'active' ? 0.7 : 0.25;
  const width = state === 'active' ? 2.5 : 1.5;

  return (
    <>
      {/* Glow pass */}
      {state === 'active' && (
        <path
          d={d}
          fill="none"
          stroke={branchInfo.glowColor}
          strokeWidth={width + 3}
          strokeLinecap="round"
          opacity={0.15}
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        opacity={opacity}
      />
    </>
  );
}
