/**
 * El material cuesta cuando se consume, al precio real del lote usado.
 *
 * Decisión del dueño (2026-11-10), implementada en la migración
 * 20261110120000: el único escritor de material real en `ot_cost_lines` es el
 * movimiento de inventario contra una OT (`consumir_lote` → trigger
 * `trg_cost_ot_material_movement`). La cotización vive en su carril
 * (`kind = 'estimate'`) y sirve para analizar la brecha, nunca como real.
 *
 * La base rechaza cualquier otra escritura de material real. Las rutas que
 * aceptan costos a mano lo validan antes para devolver el motivo, no un 500.
 */
/**
 * Lo mismo para la máquina: su tiempo se registra cuando se consume, y eso es
 * la pasada cerrada (horas, o clics en digital) — stage-valuation.ts.
 */
export const MAQUINA_VIA_PASADA =
	'El tiempo de máquina se carga a la OT al cerrar la etapa que lo usó (sus horas, o los clics en digital) — no como costo manual.';

export const MATERIAL_VIA_CONSUMO =
	'El material se carga a la OT cuando se consume desde bodega (escaneo, backflush o captura), al costo real de su lote — no como costo manual.';
