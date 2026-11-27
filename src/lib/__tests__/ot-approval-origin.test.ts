import { describe, expect, it } from 'vitest';
import {
	PORTAL_ACTOR,
	aprobacionParaMover,
	cuentaParaCalidadInterna,
	esDelPortalPublico,
} from '../ot-approval-origin';

/**
 * El agujero que estas pruebas cierran: `POST /api/track/[token]/approval` no
 * tiene sesión —se entra con el share token— y escribe en `ot_approvals` con
 * `status: 'approved'`. La compuerta de `ready_for_delivery` contaba cualquier
 * fila aprobada, así que un externo con un enlace satisfacía el control de
 * calidad interno firmando su propia prueba.
 *
 * El caso de la fila interna con `recorded_by` nulo está acá porque es el que
 * puede parar la imprenta: si el predicado la descartara, ninguna OT podría
 * pasar nunca a lista para despacho.
 */
describe('esDelPortalPublico', () => {
	it('reconoce la fila por confirmed_via', () => {
		expect(esDelPortalPublico({ confirmed_via: 'portal', recorded_by: null })).toBe(true);
	});

	it('reconoce la fila por recorded_by, aunque falte confirmed_via', () => {
		expect(esDelPortalPublico({ confirmed_via: null, recorded_by: PORTAL_ACTOR })).toBe(true);
	});

	it('no marca un visto bueno que registró un vendedor por otra vía', () => {
		for (const via of ['correo', 'whatsapp', 'telefono', 'presencial']) {
			expect(esDelPortalPublico({ confirmed_via: via, recorded_by: 'a-real-user-uuid' })).toBe(false);
		}
	});

	it('no marca una fila sin ninguna de las dos marcas', () => {
		expect(esDelPortalPublico({})).toBe(false);
		expect(esDelPortalPublico({ confirmed_via: null, recorded_by: null })).toBe(false);
	});
});

describe('cuentaParaCalidadInterna', () => {
	it('rechaza la aprobación que vino del portal del cliente', () => {
		expect(
			cuentaParaCalidadInterna({
				status: 'approved',
				confirmed_via: 'portal',
				recorded_by: PORTAL_ACTOR,
			})
		).toBe(false);
	});

	it('acepta una aprobación interna aunque recorded_by sea nulo', () => {
		// `ot_approvals_decidida_tiene_quien_y_cuando` sólo exige `recorded_by`
		// en filas DECIDIDAS; la aprobación interna deja `decision` en null y
		// puede no traerlo. Descartarla dejaría la compuerta cerrada para
		// siempre: es el caso que para la planta.
		expect(
			cuentaParaCalidadInterna({ status: 'approved', confirmed_via: null, recorded_by: null })
		).toBe(true);
	});

	it('acepta el visto bueno del cliente que registró alguien del taller', () => {
		// Ahí sí hay una persona identificada que responde por la fila.
		expect(
			cuentaParaCalidadInterna({
				status: 'approved',
				confirmed_via: 'correo',
				recorded_by: 'vendedor-uuid',
			})
		).toBe(true);
	});

	it('no cuenta una fila que no está aprobada, venga de donde venga', () => {
		for (const status of ['pending', 'rejected', null, undefined]) {
			expect(
				cuentaParaCalidadInterna({ status, confirmed_via: null, recorded_by: 'vendedor-uuid' })
			).toBe(false);
		}
	});

	it('un rechazo del portal tampoco cuenta', () => {
		expect(
			cuentaParaCalidadInterna({
				status: 'rejected',
				confirmed_via: 'portal',
				recorded_by: PORTAL_ACTOR,
			})
		).toBe(false);
	});
});

/**
 * Las dos compuertas que miran `ot_approvals` piden cosas distintas:
 *  - comprar papel (`paper_purchase`) pide el visto bueno DEL CLIENTE — y el
 *    portal es el cliente mismo, así que su firma cuenta;
 *  - lista para despacho pide la revisión INTERNA — ahí el portal no cuenta.
 * `moveOT` aplicaba la regla interna a las dos: una OT que el cliente aprobó
 * por el enlace no se podía pasar a Compra de Papel desde el Tablero.
 */
describe('aprobacionParaMover', () => {
	const portal = { status: 'approved', confirmed_via: 'portal', recorded_by: PORTAL_ACTOR };
	const vendedor = { status: 'approved', confirmed_via: 'correo', recorded_by: 'u-vendedor' };
	const rechazo = { status: 'rejected', confirmed_via: 'correo', recorded_by: 'u-vendedor' };

	it('la firma del cliente por el portal habilita comprar papel', () => {
		expect(aprobacionParaMover('paper_purchase', [portal])).toBe(true);
	});

	it('la firma del portal NO es la revisión de calidad para despachar', () => {
		expect(aprobacionParaMover('ready_for_delivery', [portal])).toBe(false);
	});

	it('una aprobación registrada por el taller sirve para las dos', () => {
		expect(aprobacionParaMover('paper_purchase', [vendedor])).toBe(true);
		expect(aprobacionParaMover('ready_for_delivery', [vendedor])).toBe(true);
	});

	it('un rechazo o ninguna fila no habilitan nada', () => {
		expect(aprobacionParaMover('paper_purchase', [rechazo])).toBe(false);
		expect(aprobacionParaMover('paper_purchase', [])).toBe(false);
	});
});
