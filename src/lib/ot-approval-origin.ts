/**
 * Quién escribió una fila de `ot_approvals`, y qué controles puede satisfacer.
 *
 * ── El problema que este módulo existe para cerrar ─────────────────────────
 *
 * `ot_approvals` guarda dos cosas distintas con la misma forma:
 *
 *   1. el visto bueno del CLIENTE sobre una prueba (es para lo que la tabla
 *      fue modelada: `proofed_on`, `confirmed_via`, `vb_id`, `round`);
 *   2. la aprobación INTERNA de calidad, que `POST /api/ots/[id]/approval`
 *      resuelve y que la máquina de estados exige antes de
 *      `ready_for_delivery`.
 *
 * La compuerta contaba cualquier fila con `status = 'approved'`, sin mirar
 * quién la puso. Y una de las vías que la pone es
 * `POST /api/track/[token]/approval`: el portal del cliente, que **no tiene
 * sesión** — se entra con el share token y nada más. O sea: alguien externo con
 * un enlace podía satisfacer un control de calidad interno firmando su propia
 * prueba (auditoría 2026-10, §Bad «Quality» y §5C del plan de remediación).
 *
 * No es sólo un problema de modelado: el expediente de calidad
 * (`/api/ots/[id]/dossier`) presentaba esa misma fila como aprobación de
 * calidad. Un documento de cumplimiento que confunde «el cliente aceptó el
 * color» con «la imprenta revisó el trabajo» afirma algo que nadie verificó.
 *
 * ── Por qué se discrimina por origen y no por un `kind` nuevo ──────────────
 *
 * Porque el dato para distinguirlas YA existe y no hay que migrar nada ni
 * adivinar qué significan las filas viejas: el portal se marca a sí mismo con
 * `confirmed_via: 'portal'` y `recorded_by: PORTAL_ACTOR`. Agregar una columna
 * `kind` obligaría a rellenar las filas históricas por inferencia, y una
 * inferencia sobre evidencia de calidad es exactamente lo que no conviene
 * escribir.
 */

/**
 * `recorded_by` de una fila escrita por el portal público.
 *
 * Un UUID nulo constante: el portal no tiene un usuario con sesión detrás, y
 * la ruta documenta por qué no corresponde inventar un vendedor que no actuó.
 * La responsabilidad real de esa fila la sostienen `approver_name`,
 * `source_ip` y `confirmed_via`.
 *
 * Vive acá y no en la ruta porque ahora lo leen tres lugares —el portal que lo
 * escribe, la compuerta que lo excluye y el expediente que lo etiqueta—, y tres
 * copias de un UUID mágico es cómo se llega a que una deje de calzar.
 */
export const PORTAL_ACTOR = '00000000-0000-0000-0000-000000000000';

/** Cómo se confirmó una aprobación. `portal` es la única vía sin sesión. */
export type ConfirmedVia = 'correo' | 'whatsapp' | 'telefono' | 'presencial' | 'portal';

export interface ApprovalOrigin {
	confirmed_via?: string | null;
	recorded_by?: string | null;
}

/**
 * ¿La escribió el portal público del cliente?
 *
 * Se miran las dos marcas y no una sola: `confirmed_via` es la intención
 * declarada y `recorded_by` es la huella del actor. Una fila vieja a la que le
 * falte una de las dos igual se reconoce.
 */
export function esDelPortalPublico(fila: ApprovalOrigin): boolean {
	return fila.confirmed_via === 'portal' || fila.recorded_by === PORTAL_ACTOR;
}

/**
 * ¿Esta fila puede satisfacer el control de calidad interno?
 *
 * Sólo si la puso alguien del taller. Un visto bueno del cliente registrado
 * por un vendedor (`/api/ots/[id]/approvals`, con control de rol) sí cuenta:
 * ahí hubo una persona identificada del taller que lo registró y responde por
 * él. Lo que no cuenta es el portal, donde no hay nadie identificado.
 */
export function cuentaParaCalidadInterna(
	fila: ApprovalOrigin & { status?: string | null }
): boolean {
	if (fila.status !== 'approved') return false;
	return !esDelPortalPublico(fila);
}
