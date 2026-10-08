import { Lock, Check, CircleDot } from 'lucide-react';
import { BRANCHES, type SkillNodeDef, type NodeState } from '@/lib/craft-skill-paths';
import { ICON_MAP, NODE_R, MASTER_R, PROF_DOT_R } from './constants';

// ── Single Skill Node ────────────────────────────────────────────────

export function SkillNodeCircle({
  node,
  state,
  proficiency,
  isSelected,
  templateHighlight,
  templateMissing,
  onClick,
}: {
  node: SkillNodeDef;
  state: NodeState;
  proficiency: number;
  isSelected: boolean;
  templateHighlight?: boolean;
  templateMissing?: boolean;
  onClick: () => void;
}) {
  const branchInfo = BRANCHES[node.branch];
  const isMaster = node.tier === 5;
  const r = isMaster ? MASTER_R : NODE_R;
  const IconComp = ICON_MAP[node.icon] || CircleDot;

  // Visual state
  let bgFill: string;
  let borderColor: string;
  let borderWidth: number;
  let filterAttr: string | undefined;
  let iconColor: string;
  let opacity = 1;

  switch (state) {
    case 'mastered':
      bgFill = branchInfo.color;
      borderColor = branchInfo.glowColor;
      borderWidth = 3;
      filterAttr = `url(#glow-${node.branch})`;
      iconColor = '#ffffff';
      break;
    case 'in_progress':
      bgFill = branchInfo.darkColor;
      borderColor = branchInfo.color;
      borderWidth = 2.5;
      filterAttr = `url(#glow-${node.branch})`;
      iconColor = branchInfo.glowColor;
      break;
    case 'available':
      bgFill = '#1a1a2e';
      borderColor = branchInfo.color;
      borderWidth = 2;
      filterAttr = undefined;
      iconColor = branchInfo.color;
      break;
    case 'locked':
    default:
      bgFill = '#111118';
      borderColor = '#2a2a3a';
      borderWidth = 1.5;
      filterAttr = undefined;
      iconColor = '#4a4a5a';
      opacity = 0.55;
      break;
  }

  if (isSelected) {
    borderColor = '#ffffff';
    borderWidth = 3;
  }

  if (templateHighlight && !isSelected) {
    borderColor = '#22d3ee';
    borderWidth = 2.5;
  }

  if (templateMissing) {
    borderColor = '#f59e0b';
    borderWidth = Math.max(borderWidth, 3);
  }

  return (
    <g
      style={{ cursor: 'pointer', opacity }}
      onClick={onClick}
    >
      {/* Background circle */}
      <circle
        cx={node.x}
        cy={node.y}
        r={r}
        fill={bgFill}
        stroke={borderColor}
        strokeWidth={borderWidth}
        filter={filterAttr}
      />

      {/* Icon via foreignObject */}
      <foreignObject
        x={node.x - (isMaster ? 14 : 11)}
        y={node.y - (isMaster ? 14 : 11)}
        width={isMaster ? 28 : 22}
        height={isMaster ? 28 : 22}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
          }}
        >
          <IconComp
            style={{ width: isMaster ? 20 : 16, height: isMaster ? 20 : 16, color: iconColor }}
          />
        </div>
      </foreignObject>

      {/* Lock badge for locked nodes */}
      {state === 'locked' && (
        <foreignObject
          x={node.x + r - 10}
          y={node.y - r - 2}
          width={16}
          height={16}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock style={{ width: 11, height: 11, color: '#6b7280' }} />
          </div>
        </foreignObject>
      )}

      {/* Mastered checkmark badge */}
      {state === 'mastered' && (
        <foreignObject
          x={node.x + r - 10}
          y={node.y - r - 2}
          width={16}
          height={16}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: branchInfo.color,
            }}
          >
            <Check style={{ width: 10, height: 10, color: '#ffffff' }} />
          </div>
        </foreignObject>
      )}

      {/* Proficiency dots (5) below the node */}
      {[1, 2, 3, 4, 5].map((lvl, i) => (
        <circle
          key={i}
          cx={node.x - 12 + i * 6}
          cy={node.y + r + 10}
          r={PROF_DOT_R}
          fill={proficiency >= lvl ? branchInfo.color : '#1e293b'}
          stroke={proficiency >= lvl ? branchInfo.glowColor : '#334155'}
          strokeWidth={0.5}
        />
      ))}

      {/* Node name label */}
      <text
        x={node.x}
        y={node.y + r + 24}
        textAnchor="middle"
        fill={state === 'locked' ? '#4a4a5a' : '#94a3b8'}
        fontSize={9}
        fontFamily="system-ui, sans-serif"
      >
        {node.name.length > 22 ? node.name.slice(0, 20) + '…' : node.name}
      </text>
    </g>
  );
}
