/**
 * Qué hay que saber para intervenir cada sistema de una máquina.
 *
 * Los dos lados existían y no se hablaban: `machine_systems` sabe que la falla
 * es del sistema hidráulico, y el catálogo de competencias sabe quién está
 * habilitado en hidráulica. Asignar una orden seguía siendo elegir a alguien de
 * una lista sin que nada verificara que sabe hacerlo.
 *
 * Este mapa cierra ese hueco. No bloquea por sí solo: en un taller real, a
 * veces se interviene igual porque la máquina está parada y hay que producir.
 * Pero la app tiene que decirlo en voz alta antes, no descubrirlo después.
 */

/** `machine_systems.code` → `skills.code` de mantenimiento. */
export const SYSTEM_TO_SKILL: Record<string, string> = {
	hidraulico: 'MANT_HIDRAULICO',
	neumatico: 'MANT_NEUMATICO',
	electrico: 'MANT_ELECTRICO',
	// El PLC y las tarjetas son intervención eléctrica.
	control: 'MANT_ELECTRICO',
	// Los enclavamientos y las paradas de emergencia también.
	seguridad: 'MANT_ELECTRICO',
	termico: 'MANT_TERMICO',

	// Todo lo demás es mecánica de máquina: transmisión, rodillos, cilindros,
	// pinzas, cuchillas, cabezales.
	motriz: 'MANT_MECANICO',
	lubricacion: 'MANT_MECANICO',
	refrigeracion: 'MANT_MECANICO',
	entintado: 'MANT_MECANICO',
	mojado: 'MANT_MECANICO',
	mantillas: 'MANT_MECANICO',
	transporte: 'MANT_MECANICO',
	corte: 'MANT_MECANICO',
	troquelado: 'MANT_MECANICO',
	rodadura: 'MANT_MECANICO',
	plegado: 'MANT_MECANICO',
	arrastre: 'MANT_MECANICO',
	alzado: 'MANT_MECANICO',
	corchete: 'MANT_MECANICO',
	encolado: 'MANT_MECANICO',
	fresado: 'MANT_MECANICO',
	mordazas: 'MANT_MECANICO',
	bobina: 'MANT_MECANICO',
};

/**
 * Sistemas donde no basta con saber: hace falta la certificación vigente.
 * Alta presión y riesgo eléctrico — coinciden con las dos competencias que el
 * catálogo marca con vencimiento a 24 meses.
 */
export const SYSTEMS_REQUIRING_CERTIFICATION = new Set(['hidraulico', 'electrico', 'control', 'seguridad']);

/** Nivel mínimo para intervenir solo: 3 = Autónomo en la escalera del taller. */
export const MIN_LEVEL_TO_INTERVENE = 3;

export function skillForSystem(systemCode: string | null | undefined): string | null {
	if (!systemCode) return null;
	return SYSTEM_TO_SKILL[systemCode] ?? 'MANT_MECANICO';
}

export function systemRequiresCertification(systemCode: string | null | undefined): boolean {
	return !!systemCode && SYSTEMS_REQUIRING_CERTIFICATION.has(systemCode);
}

export interface AssigneeCheck {
	ok: boolean;
	/** Hace falta que un supervisor confirme explícitamente antes de asignar. */
	requiresAcknowledgement: boolean;
	requiredSkillCode: string | null;
	reason: string | null;
}

export function checkAssignee(params: {
	systemCode: string | null | undefined;
	/** Nivel efectivo de la persona en la competencia del sistema. */
	level: number | null;
	certified: boolean;
	certificationExpired: boolean;
	assigneeName: string;
	systemName?: string | null;
}): AssigneeCheck {
	const { systemCode, level, certified, certificationExpired, assigneeName } = params;
	const skill = skillForSystem(systemCode);
	const sistema = params.systemName ?? systemCode ?? 'este sistema';

	if (!skill) {
		return { ok: true, requiresAcknowledgement: false, requiredSkillCode: null, reason: null };
	}

	const necesitaCert = systemRequiresCertification(systemCode);

	if (level == null || level === 0) {
		return {
			ok: false,
			// Sin ninguna competencia declarada en el sistema, siempre se pide
			// confirmación: puede que sepa y nadie lo haya registrado, pero el
			// supervisor tiene que hacerse cargo de esa suposición.
			requiresAcknowledgement: true,
			requiredSkillCode: skill,
			reason: `${assigneeName} no tiene competencia registrada en ${sistema}. Si igualmente es quien corresponde, confírmalo — y conviene registrarle la competencia después.`,
		};
	}

	if (level < MIN_LEVEL_TO_INTERVENE) {
		return {
			ok: false,
			requiresAcknowledgement: true,
			requiredSkillCode: skill,
			reason: `${assigneeName} está en nivel ${level} en ${sistema}; para intervenir solo se pide nivel ${MIN_LEVEL_TO_INTERVENE}. Puede hacerlo acompañado.`,
		};
	}

	if (necesitaCert && certificationExpired) {
		return {
			ok: false,
			requiresAcknowledgement: true,
			requiredSkillCode: skill,
			reason: `${assigneeName} tiene la certificación de ${sistema} vencida. Reevaluar antes de asignarle trabajo en este sistema.`,
		};
	}

	if (necesitaCert && !certified) {
		return {
			ok: false,
			requiresAcknowledgement: true,
			requiredSkillCode: skill,
			reason: `${sistema} exige certificación vigente y ${assigneeName} no la tiene registrada.`,
		};
	}

	return { ok: true, requiresAcknowledgement: false, requiredSkillCode: skill, reason: null };
}
