/**
 * The text of a labour cost line — written and read in one place.
 *
 * stage-valuation.ts writes one `ot_cost_lines` row per person per pass, and
 * the person is only in the description: «Mano de obra — Ana Soto (2 h, turno
 * Mañana 2026-11-12)». Readers (Mano de obra by OT, hours per person) need the
 * name back. Before, the format lived in the writer and a regex for it lived in
 * a reader; a change to one would silently zero the other. Both now import
 * this module.
 */

export interface LaborLineParts {
	who: string;
	hours: number;
	/** «Mañana», or a name that already starts with «turno». */
	shiftName: string;
	/** YYYY-MM-DD */
	date: string;
	missingRate: boolean;
}

export function laborLineDescription({ who, hours, shiftName, date, missingRate }: LaborLineParts): string {
	const shiftLabel = /^turno\b/i.test(shiftName) ? shiftName : `turno ${shiftName}`;
	return `Mano de obra — ${who} (${hours} h, ${shiftLabel} ${date}${missingRate ? ', sin tarifa en Planta' : ''})`;
}

/** «Mano de obra — Ana Soto (2 h, turno Mañana 2026-11-12)» → «Ana Soto». */
export function personOfLaborLine(description: string | null | undefined): string | null {
	const m = /^Mano de obra — (.+?) \(/.exec(description ?? '');
	return m ? m[1] : null;
}

/**
 * Who a labour line is for — the one rule every reader uses.
 *
 * Since migration 20261126130000 the line carries `employee_id`: that is the
 * identity, and the name shown is the person's CURRENT name (a renamed ficha
 * does not split their hours in two). A line without an id (written before
 * the migration and not backfilled because its name was ambiguous) falls back
 * to the name in its text, keyed by that name so it never merges into
 * someone else's id.
 */
export function laborLinePerson(
	line: { employee_id?: string | null; description?: string | null },
	nameById: Map<string, string>,
): { key: string; employeeId: string | null; name: string } | null {
	if (line.employee_id) {
		return { key: line.employee_id, employeeId: line.employee_id, name: nameById.get(line.employee_id) ?? personOfLaborLine(line.description) ?? 'Operario' };
	}
	const name = personOfLaborLine(line.description);
	return name ? { key: `name:${name}`, employeeId: null, name } : null;
}
