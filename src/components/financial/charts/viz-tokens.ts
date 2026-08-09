/**
 * Paleta de gráficos, validada — no elegida a ojo.
 *
 * Los ocho colores y su ORDEN salen de una paleta de referencia cuyo orden es el
 * mecanismo de seguridad para daltonismo, no una decisión estética. Se validaron
 * contra las superficies reales de esta app —`--card`, que es #fdfcfb en claro y
 * #131620 en oscuro— y no contra las del catálogo:
 *
 *   claro   banda de luminosidad ✓  croma ✓  separación CVD 9,1 (protan) ✓
 *           contraste: aqua 2,75 y amarillo 2,11 quedan bajo 3:1
 *   oscuro  todo ✓, incluido contraste ≥ 3:1
 *
 * Ese aviso de contraste en claro NO se descarta: obliga a "relieve" —etiquetas
 * visibles sobre los segmentos y una vista de tabla equivalente. Las dos están.
 *
 * Los pasos oscuros son la misma familia re-escalonada para fondo oscuro, no un
 * invento aparte ni una inversión automática.
 */

/** Identidad: qué componente del costo es. Orden fijo, nunca rotado. */
export const SERIES = {
	light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] as const,
	dark: ['#3987e5', '#d95926', '#199e70', '#c98500'] as const,
};

/**
 * Polaridad: por encima o por debajo de cero. Azul y rojo se leen como
 * opuestos; el punto medio es gris y se lee como "nada", que es justo lo que
 * significa un margen cero.
 */
export const DIVERGING = {
	light: { positivo: '#2a78d6', negativo: '#d03b3b', cero: '#f0efec' },
	dark: { positivo: '#3987e5', negativo: '#e66767', cero: '#383835' },
};

/** Cromo del gráfico: rejilla y ejes recesivos, un tono sobre la superficie. */
export const CHROME = {
	light: { grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781' },
	dark: { grid: '#2c2c2a', axis: '#383835', muted: '#898781' },
};

/** Las cuatro partidas del costo de un trabajo, en orden fijo. */
export const COST_PARTS = [
	{ key: 'material_actual', label: 'Materiales' },
	{ key: 'labor_actual', label: 'Mano de obra' },
	{ key: 'machine_actual', label: 'Máquina' },
	{ key: 'other_actual', label: 'Otros' },
] as const;

export type CostPartKey = (typeof COST_PARTS)[number]['key'];

/**
 * El color sigue a la ENTIDAD, no a su posición en la lista. Filtrar una OT no
 * puede repintar a las que quedan: quien aprendió que «materiales es azul» no
 * debe encontrárselo naranja al día siguiente.
 */
export function costPartColor(key: CostPartKey, dark: boolean): string {
	const i = COST_PARTS.findIndex((p) => p.key === key);
	const slots = dark ? SERIES.dark : SERIES.light;
	return slots[i] ?? slots[slots.length - 1];
}

/** Miles y millones abreviados para ejes; el valor exacto vive en el tooltip. */
export function compactCLP(v: number): string {
	const abs = Math.abs(v);
	if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
	if (abs >= 1_000) return `$${Math.round(v / 1_000)}k`;
	return `$${Math.round(v)}`;
}
