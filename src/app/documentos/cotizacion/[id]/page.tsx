'use client';

import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { use } from 'react';

import ProtectedRoute from '@/components/ProtectedRoute';
import { LogoEmpresa } from '@/components/documentos/LogoEmpresa';
import { CONDICIONES, EMPRESA, VIGENCIA_DIAS } from '@/lib/company';
import { formatCLP } from '@/lib/format';
import { priceBand } from '@/lib/ot-spec';

/**
 * La cotización que ve el cliente.
 *
 * ── Por qué son dos documentos y no uno ─────────────────────────────────────
 *
 * El mismo trabajo se cotiza dos veces y las dos cifras significan cosas
 * distintas. La primera sale del teléfono con el vendedor y es una ESTIMACIÓN:
 * honesta, con banda, sin fingir precisión que no tiene. La segunda sale de
 * Pre-Prensa con la ficha completa y es un precio FIRME.
 *
 * Mandar las dos con la misma cara es lo que produce la conversación más cara
 * del rubro —«pero ustedes me habían dicho»— así que el documento lo dice: la
 * preliminar muestra el rango y qué falta para cerrarlo; la final muestra un
 * número y la fecha en que se comprometió.
 *
 * ── Por qué imprimible y no PDF generado ────────────────────────────────────
 *
 * `window.print()` produce el PDF con el diálogo del sistema, sin sumar una
 * dependencia de generación ni un servicio que mantener.
 *
 * OJO — esto es INTERNO, no un enlace para mandarle al cliente. La página no
 * tiene sesión propia y los datos los sirve `/api/ots/[id]`, que exige estar
 * autenticado: quien abra la URL desde afuera no ve nada. El flujo real es
 * abrirlo acá, guardar el PDF y mandar el archivo. Para que fuera de verdad
 * compartible haría falta un token público como el de `/track/[token]`.
 */
export default function CotizacionImprimible({ params }: { params: Promise<{ id: string }> }) {
	// Era la única pantalla del proyecto sin guardia. Hoy no filtraba —la API
	// devuelve 401— pero eso dejaba toda la protección en manos del endpoint, en
	// la página que muestra precios y clientes.
	return (
		<ProtectedRoute>
			<Documento params={params} />
		</ProtectedRoute>
	);
}

function Documento({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);

	// La aprobación decide si el documento es una estimación o un compromiso.
	const { data: aprobacion } = useQuery({
		queryKey: ['ot-aprobacion', id],
		queryFn: async () => {
			const res = await fetch(`/api/ots/${id}/approvals`);
			return res.ok ? res.json() : null;
		},
	});

	const { data: ot, isLoading } = useQuery({
		queryKey: ['ot-documento', id],
		queryFn: async () => {
			const res = await fetch(`/api/ots/${id}`);
			if (!res.ok) throw new Error('No se encontró la orden');
			const b = await res.json();
			return (b.ot ?? b) as Record<string, any>;
		},
	});

	if (isLoading) return <p className="p-10 text-sm text-gray-500">Cargando…</p>;
	if (!ot) return <p className="p-10 text-sm text-gray-500">No se encontró la cotización.</p>;

	// Un precio es firme cuando alguien lo aprobó, no cuando la OT cambió de
	// columna. Con `status !== 'pre_press'` una orden recién llegada a Visto
	// Bueno —sin ninguna decisión registrada— ya imprimía «Cotización final»:
	// el papel afirmaba un compromiso que todavía no existía.
	const firme = aprobacion?.estado?.approved === true;
	const precio = Number(ot.total_price) || 0;
	// La banda se calcula sobre lo que la ficha REALMENTE tiene: se ensancha por
	// los datos que faltan, no por un porcentaje fijo. Así el documento dice la
	// verdad sobre su propia precisión.
	// Los dos campos que no son columnas se deducen del RASTRO, igual que en
	// Pre-Prensa. Fijarlos en `false` ensanchaba la banda a propósito y ponía en
	// un papel que va al cliente un número calculado con datos inventados.
	const banda = priceBand(
		{
			pressId: ot.assigned_machine_id,
			machineId: ot.assigned_machine_id,
			impositionConfirmed: !!ot.imposition_confirmed_at || !!ot.assigned_machine_id,
			operationsReviewed: !!ot.operations_reviewed_at,
			substrateType: ot.substrate_type,
			grammageGsm: ot.grammage_gsm,
			quantity: ot.quantity,
			widthCm: ot.width_cm,
			heightCm: ot.height_cm,
		},
		precio,
	);
	const emitida = new Date(ot.created_at ?? Date.now());
	const vence = new Date(emitida.getTime() + VIGENCIA_DIAS * 86_400_000);
	const fecha = (d: Date) => d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

	const terminaciones = [
		['finish_troquelado', 'Troquelado'], ['finish_plegado', 'Plegado'], ['finish_pegado', 'Pegado'],
		['finish_laminado', 'Laminado'], ['finish_barniz', 'Barniz'], ['finish_relieve', 'Relieve'],
		['finish_perforado', 'Perforado'], ['finish_hot_stamping', 'Hot stamping'],
		['finish_uv_localizado', 'UV localizado'], ['finish_numeracion', 'Numeración'],
	].filter(([k]) => ot[k]).map(([, label]) => label);

	const filas: [string, string][] = [
		['Producto', ot.product_name ?? '—'],
		['Cantidad', `${Number(ot.quantity ?? 0).toLocaleString('es-CL')} unidades`],
		['Formato', ot.width_cm && ot.height_cm ? `${ot.width_cm} × ${ot.height_cm} cm` : '—'],
		['Sustrato', [ot.substrate_type, ot.grammage_gsm ? `${ot.grammage_gsm} g/m²` : null].filter(Boolean).join(' · ') || '—'],
		['Impresión', [ot.color_front, ot.color_back && ot.color_back !== 'sin_impresion' ? `/ ${ot.color_back}` : null].filter(Boolean).join(' ') || '—'],
		['Terminaciones', terminaciones.length ? terminaciones.join(' · ') : 'Sin terminaciones'],
	];

	return (
		<div className="doc-raiz min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
			{/* Sólo en pantalla: el botón no puede salir impreso en el documento. */}
			<div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-4 print:hidden">
				<button
					onClick={() => window.print()}
					className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
				>
					<Printer className="h-4 w-4" />
					Imprimir o guardar como PDF
				</button>
			</div>

			<article className="mx-auto max-w-[210mm] bg-white px-[18mm] py-[16mm] text-gray-900 shadow-lg print:max-w-none print:px-0 print:py-0 print:shadow-none">
				<header className="flex items-start justify-between border-b-2 border-gray-900 pb-4">
					<div>
						<LogoEmpresa className="h-12 w-auto" />
						<p className="mt-2 text-[10px] leading-relaxed text-gray-500">
							{EMPRESA.razonSocial} · RUT {EMPRESA.rut}
							<br />
							{EMPRESA.direccion}, {EMPRESA.ciudad}
							<br />
							{EMPRESA.telefono} · {EMPRESA.email}
						</p>
					</div>

					<div className="text-right">
						<h1 className="font-serif text-2xl font-semibold tracking-tight">
							{firme ? 'Cotización final' : 'Cotización'}
						</h1>
						<p className="mt-0.5 font-mono text-sm font-semibold">{ot.ot_number}</p>
						<p className="mt-2 text-[11px] text-gray-500">
							Emitida el {fecha(emitida)}
							<br />
							Válida hasta el {fecha(vence)}
						</p>
					</div>
				</header>

				<section className="mt-6 grid grid-cols-2 gap-8">
					<div>
						<h2 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Cliente</h2>
						<p className="mt-1 text-sm font-medium">{ot.client_name ?? '—'}</p>
					</div>
					{ot.deadline && (
						<div>
							<h2 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
								Entrega comprometida
							</h2>
							<p className="mt-1 text-sm font-medium">
								{fecha(new Date(ot.deadline.length <= 10 ? `${ot.deadline}T00:00:00` : ot.deadline))}
							</p>
						</div>
					)}
				</section>

				<section className="mt-6">
					<h2 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
						Especificaciones
					</h2>
					<table className="mt-2 w-full border-collapse text-sm">
						<tbody>
							{filas.map(([k, v]) => (
								<tr key={k} className="border-b border-gray-100">
									<th className="w-40 py-1.5 text-left align-top font-normal text-gray-500">{k}</th>
									<td className="py-1.5 align-top">{v}</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>

				<section className="mt-8 border-t-2 border-gray-900 pt-4">
					{firme ? (
						<div className="flex items-end justify-between">
							<div>
								<p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
									Precio total
								</p>
								<p className="mt-0.5 text-[11px] text-gray-500">
									Valor neto, no incluye IVA · {Number(ot.quantity ?? 0).toLocaleString('es-CL')} unidades
								</p>
							</div>
							<p className="font-serif text-3xl font-semibold tabular-nums">{formatCLP(precio)}</p>
						</div>
					) : (
						<>
							{/* La banda no es una cobertura: es lo honesto antes de que
							    Pre-Prensa mida. Un número solo, dicho por teléfono, se
							    convierte después en «pero ustedes me habían dicho». */}
							<div className="flex items-end justify-between">
								<div>
									<p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
										Precio estimado
									</p>
									<p className="mt-0.5 text-[11px] text-gray-500">
										Valor neto, no incluye IVA · {Number(ot.quantity ?? 0).toLocaleString('es-CL')} unidades
									</p>
								</div>
								<p className="font-serif text-2xl font-semibold tabular-nums">
									{formatCLP(banda.low)} <span className="text-base font-normal text-gray-400">a</span>{' '}
									{formatCLP(banda.high)}
								</p>
							</div>
							<p className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
								Este valor es una <strong>estimación preliminar</strong>. El precio queda firme una vez
								confirmados el montaje, el papel y las terminaciones en Pre-Prensa, y se comunica antes
								de comenzar cualquier compra.
							</p>
						</>
					)}
				</section>

				<footer className="mt-8 border-t border-gray-200 pt-3">
					<h2 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Condiciones</h2>
					<ul className="mt-1.5 space-y-0.5">
						{CONDICIONES.map((c) => (
							<li key={c} className="text-[10px] leading-relaxed text-gray-500">
								· {c}
							</li>
						))}
					</ul>
					<p className="mt-4 text-center text-[10px] text-gray-400">
						{EMPRESA.nombre} · {EMPRESA.web} · {EMPRESA.telefono}
					</p>
				</footer>
			</article>

			{/* Carta chilena en vez de A4 haría que la última línea se corte en la
			    mitad de las impresoras del país. */}
			<style jsx global>{`
				@page {
					size: A4;
					margin: 14mm 16mm;
				}
				@media print {
					.doc-raiz {
						background: white;
					}
					article {
						break-inside: avoid;
					}
				}
			`}</style>
		</div>
	);
}
