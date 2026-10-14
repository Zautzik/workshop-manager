import type { Metadata } from 'next';
import Link from 'next/link';
import { EMPRESA, datoEmpresa } from '@/lib/company';

/**
 * Política de privacidad — /legal/privacidad
 *
 * Es la URL que pide Meta para la WhatsApp Business Platform, así que tiene que
 * abrir SIN sesión. Dos cosas lo garantizan y las dos están en `AppShell`:
 * `/legal/` está en `isPublicRoute` (si no, un visitante anónimo rebota a
 * /login — el mismo bug que tenía `/track/`) y en `isFullscreenRoute` (para que
 * no se dibuje el nav de la planta alrededor de un documento legal).
 *
 * ── Por qué la identidad sale de `company.ts` y no está escrita acá ────────
 *
 * Porque ya se desincronizó una vez. La primera versión de esta página era un
 * archivo estático en `public/` que decía «Gonsa S.A.», mientras
 * `src/lib/company.ts` —la fuente que usan la cotización y las guías— dice
 * «Imprenta Gons SpA». En Chile S.A. y SpA son tipos de sociedad distintos, así
 * que una de las dos estaba mal y nadie lo iba a notar: son dos archivos que
 * nadie lee juntos.
 *
 * Leyendo de `EMPRESA`, el nombre legal, el RUT y el domicilio de esta política
 * son los mismos que salen impresos en una cotización. Arreglar `company.ts`
 * arregla los tres documentos.
 *
 *   ⚠ `company.ts` todavía tiene valores de RELLENO (su propio encabezado lo
 *     dice). Hasta que se reemplacen, esta página publica una razón social y un
 *     RUT inventados. Eso es a propósito visible: un dato legal equivocado es
 *     mejor verlo en pantalla que esconderlo en un segundo archivo.
 *
 * Server component a propósito: no necesita estado ni el bundle de React para
 * leerse, y así sobrevive a cualquier error de cliente.
 */

export const metadata: Metadata = {
	title: `Política de privacidad · ${EMPRESA.nombre}`,
	description: `Política de privacidad de GonsAdmin, el sistema interno de producción de ${EMPRESA.razonSocial}, y del canal de WhatsApp para reportes de planta.`,
};

/** Fecha de la última revisión del texto. Se actualiza a mano, con el texto. */
const ACTUALIZADA = '14 de octubre de 2026';

/** Canal para ejercer derechos. Conviene que sea una casilla de rol, no personal. */
const CONTACTO_PRIVACIDAD = 'rzautzikg@gmail.com';

/**
 * Cierra una frase con punto, sin duplicarlo.
 *
 * «Inversiones Gonsa S.A.» ya termina en punto, así que agregarle otro deja
 * «S.A..». Pasa sólo cuando el RUT y el domicilio están pendientes y la frase
 * termina justo en la razón social — o sea, hoy.
 */
function terminar(frase: string): string {
	return frase.endsWith('.') ? frase : `${frase}.`;
}

function Seccion({
	id,
	titulo,
	children,
}: {
	id: string;
	titulo: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mt-8">
			<h2 id={id} className="text-lg font-semibold tracking-tight text-foreground">
				{titulo}
			</h2>
			<div className="mt-2 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
				{children}
			</div>
		</section>
	);
}

export default function PoliticaPrivacidadPage() {
	// `null` mientras el dato siga siendo de relleno — ver `EMPRESA_PENDIENTE`.
	const rut = datoEmpresa('rut');
	const direccion = datoEmpresa('direccion');
	const ciudad = datoEmpresa('ciudad');
	const domicilio = [direccion, ciudad].filter(Boolean).join(', ') || null;

	return (
		<main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
			<header>
				<h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
					Política de privacidad de GonsAdmin
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					{EMPRESA.razonSocial} · Última actualización: {ACTUALIZADA}
				</p>
			</header>

			<p className="mt-6 text-sm leading-relaxed text-muted-foreground">
				GonsAdmin es el sistema interno de gestión de producción de {EMPRESA.razonSocial},{' '}
				{EMPRESA.giro.toLowerCase()}. Esta política explica qué datos personales trata GonsAdmin
				—tanto los que llegan por su número de WhatsApp como los del personal de la imprenta—,
				para qué se usan y cómo ejercer tus derechos sobre ellos.
			</p>

			<Seccion id="responsable" titulo="1. Responsable">
				{/*
				  El RUT y el domicilio se imprimen SÓLO si son reales. Siguen en
				  `EMPRESA_PENDIENTE`, y este es el documento que identifica al
				  responsable del tratamiento: un nombre legal verdadero junto a un RUT
				  inventado se lee como un dato verificado, y es peor que no decirlo.
				  Al sacarlos de esa lista, la frase se completa sola.
				*/}
				<p>
					{/* `terminar` evita «S.A..»: la razón social ya trae su propio punto. */}
					{terminar(
						`El responsable del tratamiento es ${EMPRESA.razonSocial}` +
							(rut ? `, RUT ${rut}` : '') +
							(domicilio ? `, con domicilio en ${domicilio}` : ''),
					)}{' '}
					Para cualquier consulta sobre esta política o sobre tus datos, escribe a{' '}
					<a className="text-primary underline underline-offset-2" href={`mailto:${CONTACTO_PRIVACIDAD}`}>
						{CONTACTO_PRIVACIDAD}
					</a>
					.
				</p>
			</Seccion>

			<Seccion id="datos-whatsapp" titulo="2. Qué datos recibimos por WhatsApp">
				<p>
					El número de WhatsApp de la imprenta recibe reportes de trabajo enviados por personal de
					la planta. De cada mensaje recibimos:
				</p>
				<ul className="list-disc space-y-1 pl-5">
					<li>el número de teléfono y el nombre de perfil de WhatsApp de quien lo envía;</li>
					<li>el contenido del mensaje: texto y, si se adjuntan, fotos o documentos;</li>
					<li>la fecha y hora del mensaje y su identificador técnico asignado por WhatsApp.</li>
				</ul>
				<p>
					No solicitamos datos sensibles por este canal. Te pedimos no enviar por aquí información
					personal que no sea necesaria para el reporte.
				</p>
			</Seccion>

			<Seccion id="datos-personal" titulo="3. Qué datos tratamos del personal">
				<p>
					Para administrar la producción y cumplir obligaciones laborales, GonsAdmin también
					guarda, del personal de la imprenta: datos de identificación y contacto; el contrato de
					trabajo y sus condiciones de jornada; la remuneración y sus liquidaciones; las marcas de
					entrada y salida y la credencial con que se registran; las competencias y
					certificaciones asociadas a cada máquina; y los documentos de personal que la empresa
					deba conservar.
				</p>
				<p>
					Estos datos se tratan para ejecutar el contrato de trabajo, calcular remuneraciones y
					costos de producción, asignar turnos según competencias acreditadas, y cumplir las
					obligaciones legales de la empresa. No se usan para ninguna otra finalidad.
				</p>
			</Seccion>

			<Seccion id="finalidad" titulo="4. Para qué usamos los reportes">
				<ul className="list-disc space-y-1 pl-5">
					<li>
						Identificar a la persona que reporta, comparando su número con la ficha de personal.
					</li>
					<li>
						Registrar el avance de órdenes de trabajo (inicio, término, cantidades, horas e
						incidencias) y de órdenes de mantención, para el control de producción y de costos.
					</li>
					<li>Guardar las fotos como evidencia del trabajo informado.</li>
				</ul>
				<p>
					No usamos estos datos con fines publicitarios, no los vendemos y no enviamos mensajes
					promocionales.
				</p>
			</Seccion>

			<Seccion id="destinatarios" titulo="5. Con quién se comparten">
				<p>Solo con los proveedores que hacen funcionar el servicio, y únicamente para ese fin:</p>
				<ul className="list-disc space-y-1 pl-5">
					<li>Meta Platforms, Inc. (WhatsApp Business Platform), que transmite los mensajes;</li>
					<li>Supabase, que aloja la base de datos;</li>
					<li>Vercel, que aloja la aplicación;</li>
					<li>cuando corresponde, servicios de monitoreo de errores técnicos de la aplicación.</li>
				</ul>
				<p>
					Estos proveedores pueden procesar datos fuera de Chile. Si incorporamos nuevos
					proveedores —por ejemplo para transcribir notas de voz o interpretar reportes de forma
					automática— o cambiamos qué datos se almacenan, actualizaremos esta política antes de
					hacerlo.
				</p>
			</Seccion>

			<Seccion id="conservacion" titulo="6. Cuánto tiempo los conservamos">
				<p>
					Conservamos los reportes mientras sean necesarios para el control de producción y para
					cumplir obligaciones legales y contables. Los datos del personal se conservan durante la
					relación laboral y después por los plazos que la ley exige. Los mensajes que no
					corresponden a un reporte válido no se incorporan a los registros de producción.
				</p>
			</Seccion>

			<Seccion id="seguridad" titulo="7. Seguridad">
				<p>
					El acceso a GonsAdmin requiere usuario y contraseña, y los permisos se asignan por rol:
					las pantallas de remuneración y de datos de personal están restringidas a
					administración y a Recursos Humanos. Las comunicaciones viajan cifradas (HTTPS), y la
					aplicación verifica la firma de cada notificación que recibe desde WhatsApp antes de
					procesarla.
				</p>
			</Seccion>

			<Seccion id="derechos" titulo="8. Tus derechos y eliminación de datos">
				<p>
					Puedes solicitar el acceso, la rectificación o la eliminación de tus datos, u oponerte a
					su tratamiento, conforme a la legislación chilena de protección de datos personales.
					Para hacerlo, escribe a{' '}
					<a className="text-primary underline underline-offset-2" href={`mailto:${CONTACTO_PRIVACIDAD}`}>
						{CONTACTO_PRIVACIDAD}
					</a>{' '}
					indicando tu número de teléfono o tu nombre completo; responderemos dentro de los plazos
					legales.
				</p>
			</Seccion>

			<Seccion id="cambios" titulo="9. Cambios a esta política">
				<p>
					Si modificamos esta política, publicaremos la nueva versión en esta misma dirección con
					su fecha de actualización.
				</p>
			</Seccion>

			<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
				<p>
					{EMPRESA.razonSocial} · GonsAdmin ·{' '}
					<Link className="text-primary underline underline-offset-2" href="/login">
						Volver al inicio
					</Link>
				</p>
			</footer>
		</main>
	);
}
