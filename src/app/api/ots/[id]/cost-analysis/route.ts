import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

/**
 * GET /api/ots/[id]/cost-analysis — Full cost analysis comparing budgeted vs real costs
 * Returns data in Gonsa-style "Análisis de Costos" format
 */
export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { id } = await params;

	if (!id || !z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: 'Valid OT id required' }, { status: 400 });
	}

	try {
		// Fetch OT header
		const { data: ot, error: otErr } = await supabaseAdmin
			.from('ots')
			.select('id, ot_number, client_name, product_name, quantity, status, created_at, total_price')
			.eq('id', id)
			.single();

		if (otErr || !ot) {
			return NextResponse.json({ error: 'OT not found' }, { status: 404 });
		}

		// Fetch budgeted operations
		const { data: operations, error: opsErr } = await supabaseAdmin
			.from('ot_operations')
			.select('id, category, name, unit, quantity, unit_cost, total_cost, sort_order')
			.eq('ot_id', id)
			.order('sort_order');

		if (opsErr) {
			console.error('Error fetching operations:', opsErr);
			return NextResponse.json({ error: 'Failed to fetch operations' }, { status: 500 });
		}

		// Fetch real costs (all steps)
		const { data: realCosts, error: rcErr } = await supabaseAdmin
			.from('ot_real_costs')
			.select('*')
			.eq('ot_id', id)
			.order('workflow_step')
			.order('operation_code');

		if (rcErr) {
			console.error('Error fetching real costs:', rcErr);
			return NextResponse.json({ error: 'Failed to fetch real costs' }, { status: 500 });
		}

		// Build analysis: merge budgeted operations with real costs
		const budgetedItems = (operations ?? []).map((op, idx) => ({
			code: String(idx + 1).padStart(5, '0'),
			description: op.name,
			category: op.category,
			estimated_qty: op.quantity,
			estimated_unit: op.unit,
			estimated_unit_cost: op.unit_cost,
			estimated_cost: op.total_cost,
			operation_id: op.id,
		}));

		// Group real costs by description (aggregate across all workflow steps)
		const realCostMap: Record<string, {
			actual_qty: number;
			actual_unit: string;
			actual_unit_cost: number;
			actual_cost: number;
			workflow_steps: string[];
		}> = {};

		for (const rc of (realCosts ?? [])) {
			const key = rc.description?.toLowerCase().trim() ?? '';
			if (!realCostMap[key]) {
				realCostMap[key] = {
					actual_qty: 0,
					actual_unit: rc.unit ?? 'unit',
					actual_unit_cost: 0,
					actual_cost: 0,
					workflow_steps: [],
				};
			}
			realCostMap[key].actual_qty += Number(rc.quantity ?? 0);
			realCostMap[key].actual_cost += Number(rc.quantity ?? 0) * Number(rc.unit_cost ?? 0);
			if (!realCostMap[key].workflow_steps.includes(rc.workflow_step)) {
				realCostMap[key].workflow_steps.push(rc.workflow_step);
			}
		}

		// Recalculate unit costs
		for (const key of Object.keys(realCostMap)) {
			const entry = realCostMap[key];
			entry.actual_unit_cost = entry.actual_qty > 0 ? entry.actual_cost / entry.actual_qty : 0;
		}

		// Merge budgeted with real; track which real costs were matched
		const matchedRealKeys = new Set<string>();
		const lineItems = budgetedItems.map((b) => {
			const key = b.description.toLowerCase().trim();
			const real = realCostMap[key];
			if (real) matchedRealKeys.add(key);

			const estCost = Number(b.estimated_cost ?? 0);
			const actCost = real ? real.actual_cost : 0;
			const deviationPct = estCost > 0 ? Math.round(((actCost - estCost) / estCost) * 10000) / 100 : null;

			return {
				code: b.code,
				description: b.description,
				category: b.category,
				estimated_qty: b.estimated_qty,
				estimated_unit: b.estimated_unit,
				estimated_unit_cost: b.estimated_unit_cost,
				estimated_cost: estCost,
				actual_qty: real?.actual_qty ?? null,
				actual_unit: real?.actual_unit ?? b.estimated_unit,
				actual_unit_cost: real?.actual_unit_cost ?? null,
				actual_cost: actCost,
				deviation_pct: deviationPct,
				has_actual: !!real,
				workflow_steps: real?.workflow_steps ?? [],
			};
		});

		// Add unbudgeted real costs (items not in original budget)
		let nextCode = budgetedItems.length + 1;
		for (const [key, real] of Object.entries(realCostMap)) {
			if (!matchedRealKeys.has(key)) {
				lineItems.push({
					code: String(nextCode++).padStart(5, '0'),
					description: key.charAt(0).toUpperCase() + key.slice(1),
					category: 'otros',
					estimated_qty: 0,
					estimated_unit: real.actual_unit,
					estimated_unit_cost: 0,
					estimated_cost: 0,
					actual_qty: real.actual_qty,
					actual_unit: real.actual_unit,
					actual_unit_cost: real.actual_unit_cost,
					actual_cost: real.actual_cost,
					deviation_pct: null, // no estimate to compare
					has_actual: true,
					workflow_steps: real.workflow_steps,
				});
			}
		}

		// Totals
		const totalEstimated = lineItems.reduce((s, l) => s + l.estimated_cost, 0);
		const totalActual = lineItems.reduce((s, l) => s + l.actual_cost, 0);
		const overallDeviation = totalEstimated > 0
			? Math.round(((totalActual - totalEstimated) / totalEstimated) * 10000) / 100
			: null;

		// Pricing info from OT

		const analysis = {
			ot: {
				id: ot.id,
				ot_number: ot.ot_number,
				client_name: ot.client_name,
				product_name: ot.product_name,
				quantity: ot.quantity,
				status: ot.status,
				created_at: ot.created_at,
						budget_amount: ot.total_price ?? 0,
			},
			summary: {
				total_estimated: Math.round(totalEstimated * 100) / 100,
				total_actual: Math.round(totalActual * 100) / 100,
				overall_deviation_pct: overallDeviation,
				line_item_count: lineItems.length,
				items_with_actuals: lineItems.filter(l => l.has_actual).length,
				items_over_budget: lineItems.filter(l => (l.deviation_pct ?? 0) > 0).length,
				items_under_budget: lineItems.filter(l => l.deviation_pct !== null && l.deviation_pct < 0).length,
			},
			line_items: lineItems,
			workflow_steps_reported: [...new Set((realCosts ?? []).map(rc => rc.workflow_step))],
		};

		return NextResponse.json(analysis);
	} catch (error) {
		console.error('Error generating cost analysis:', error);
		return NextResponse.json({ error: 'Failed to generate cost analysis' }, { status: 500 });
	}
}
