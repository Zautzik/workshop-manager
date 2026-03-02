import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { SKILL_NODES, CONNECTIONS } from '@/lib/craft-skill-paths';

/**
 * POST /api/skills/seed-crafts
 *
 * Seeds the `skills` and `skill_dependencies` tables with the complete
 * craft-skill-path definitions.  Existing skills with the same code are
 * updated (upsert), so running this multiple times is safe.
 */
export async function POST() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const sb = supabaseAdmin;
  const results = { created: 0, updated: 0, dependencies: 0, errors: [] as string[] };

  try {
    // ── 1. Upsert all skill nodes ────────────────────────────────
    // First pass: upsert skills without parent_skill_id
    for (const node of SKILL_NODES) {
      const payload = {
        code: node.code,
        name: node.name,
        description: node.description,
        category: node.category,
        skill_tree_type: node.skillTreeType,
        is_active: true,
        display_order: node.tier * 100 + SKILL_NODES.indexOf(node),
        icon_name: node.icon,
      };

      // Check if exists
      const { data: existing } = await sb
        .from('skills')
        .select('id')
        .eq('code', node.code)
        .maybeSingle();

      if (existing) {
        // Update
        const { error } = await sb
          .from('skills')
          .update(payload)
          .eq('id', existing.id);
        if (error) {
          results.errors.push(`Update ${node.code}: ${error.message}`);
        } else {
          results.updated++;
        }
      } else {
        // Insert
        const { error } = await sb
          .from('skills')
          .insert(payload);
        if (error) {
          results.errors.push(`Insert ${node.code}: ${error.message}`);
        } else {
          results.created++;
        }
      }
    }

    // ── 2. Resolve all codes → IDs ───────────────────────────────
    const { data: allSkills } = await sb
      .from('skills')
      .select('id, code');

    const codeToId = new Map<string, string>();
    (allSkills ?? []).forEach((s: any) => {
      if (s.code) codeToId.set(s.code, s.id);
    });

    // ── 3. Set parent_skill_id where applicable ──────────────────
    // Offset / Digital children → PRESS_INTRO as parent
    const pressIntroId = codeToId.get('PRESS_INTRO');
    if (pressIntroId) {
      const offsetAndDigitalCodes = SKILL_NODES
        .filter(n =>
          (n.branch === 'offset_printing' || n.branch === 'digital_printing') &&
          n.code !== 'PRESS_INTRO'
        )
        .map(n => n.code);

      for (const code of offsetAndDigitalCodes) {
        const id = codeToId.get(code);
        if (id) {
          await sb.from('skills').update({ parent_skill_id: pressIntroId }).eq('id', id);
        }
      }
    }

    // Workshop children → WORKSHOP_INTRO as parent
    const workIntroId = codeToId.get('WORKSHOP_INTRO');
    if (workIntroId) {
      const workshopCodes = SKILL_NODES
        .filter(n => n.branch === 'workshop' && n.code !== 'WORKSHOP_INTRO')
        .map(n => n.code);
      for (const code of workshopCodes) {
        const id = codeToId.get(code);
        if (id) {
          await sb.from('skills').update({ parent_skill_id: workIntroId }).eq('id', id);
        }
      }
    }

    // Guillotine children → GUILLOTINE_INTRO
    const guilIntroId = codeToId.get('GUILLOTINE_INTRO');
    if (guilIntroId) {
      const guilCodes = SKILL_NODES
        .filter(n => n.branch === 'guillotine' && n.code !== 'GUILLOTINE_INTRO')
        .map(n => n.code);
      for (const code of guilCodes) {
        const id = codeToId.get(code);
        if (id) {
          await sb.from('skills').update({ parent_skill_id: guilIntroId }).eq('id', id);
        }
      }
    }

    // Die Cutting children → DIE_CUT_INTRO
    const dieIntroId = codeToId.get('DIE_CUT_INTRO');
    if (dieIntroId) {
      const dieCodes = SKILL_NODES
        .filter(n => n.branch === 'die_cutting' && n.code !== 'DIE_CUT_INTRO')
        .map(n => n.code);
      for (const code of dieCodes) {
        const id = codeToId.get(code);
        if (id) {
          await sb.from('skills').update({ parent_skill_id: dieIntroId }).eq('id', id);
        }
      }
    }

    // ── 4. Seed skill_dependencies ───────────────────────────────
    // Clear previous craft-tree dependencies first (upsert-safe)
    for (const conn of CONNECTIONS) {
      const fromNode = SKILL_NODES.find(n => n.id === conn.from);
      const toNode = SKILL_NODES.find(n => n.id === conn.to);
      if (!fromNode || !toNode) continue;

      const fromId = codeToId.get(fromNode.code);
      const toId = codeToId.get(toNode.code);
      if (!fromId || !toId) {
        results.errors.push(`Dep skip: ${fromNode.code} → ${toNode.code} (IDs missing)`);
        continue;
      }

      // Check if dependency already exists
      const { data: existingDep } = await sb
        .from('skill_dependencies')
        .select('id')
        .eq('skill_id', toId)
        .eq('required_skill_id', fromId)
        .maybeSingle();

      if (!existingDep) {
        const { error } = await sb.from('skill_dependencies').insert({
          skill_id: toId,
          required_skill_id: fromId,
          min_proficiency_required: 1,
          is_hard_requirement: true,
          description: `${fromNode.name} is required before ${toNode.name}`,
        });
        if (error) {
          results.errors.push(`Dep ${fromNode.code}→${toNode.code}: ${error.message}`);
        } else {
          results.dependencies++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${results.created} new skills, updated ${results.updated}, created ${results.dependencies} dependencies.`,
      ...results,
    });
  } catch (error: any) {
    console.error('Seed craft skills error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to seed craft skills' },
      { status: 500 }
    );
  }
}
