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
 * ── Por qué la identidad sale de `company.ts` ──────────────────────────────
 *
 * Porque ya se desincronizó una vez: la primera versión era un archivo estático
 * en `public/` que decía «Gonsa S.A.» mientras `company.ts` —la fuente de la
 * cotización y las guías— decía «Imprenta Gons SpA». En Chile S.A. y SpA son
 * tipos de sociedad distintos, y eran dos archivos que nadie lee juntos.
 * Leyendo de `EMPRESA`, el nombre legal, el RUT y el domicilio de esta política
 * son los mismos que salen impresos en una cotización.
 *
 * ── Alcance y límites de este texto ────────────────────────────────────────
 *
 * Alcance: TODA la empresa, no sólo el canal de WhatsApp (decisión del dueño,
 * 2026-10-15). Por eso hay secciones separadas para el personal, los clientes y
 * el canal de reportes.
 *
 * Se estructuró contra el deber de información de la Ley 21.719 (art. 14 ter,
 * doce puntos mínimos) y contra el art. 13 del RGPD como línea de base de
 * industria, porque la ley chilena sigue de cerca ese modelo.
 *
 *   ⚠ NO SE PUDO LEER EL TEXTO OFICIAL. La BCN sirve la ley desde una
 *     aplicación con JavaScript que no se pudo renderizar, así que la lista de
 *     doce puntos viene de fuentes secundarias (guías de estudios jurídicos),
 *     no del articulado. **Esto necesita revisión de un abogado antes de
 *     publicarse como el compromiso legal de la empresa**, en particular los
 *     plazos de conservación y las bases de licitud, que son los dos puntos
 *     donde una guía puede simplificar.
 */

export const metadata: Metadata = {
	title: `Política de privacidad · ${EMPRESA.nombre}`,
	description: `Política de privacidad de ${EMPRESA.razonSocial}: qué datos personales trata GonsAdmin, con qué finalidad y cómo ejercer los derechos de acceso, rectificación, supresión, oposición, portabilidad y bloqueo.`,
};

/** Fecha y versión: punto 1 del deber de información. Se actualizan con el texto. */
const ACTUALIZADA = '16 de octubre de 2026';
const VERSION = '2.0';

/** Canal único para ejercer derechos. */
const CONTACTO_PRIVACIDAD = 'rzautzikg@gmail.com';

/**
 * Cierra una frase con punto, sin duplicarlo.
 *
 * «Inversiones Gonsa S.A.» ya termina en punto, así que agregarle otro deja
 * «S.A..». Hoy la frase cierra con la ciudad, pero esto queda porque la
 * condición vuelve cada vez que un dato se marca pendiente.
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

function Correo() {
	return (
		<a
			className="text-primary underline underline-offset-2"
			href={`mailto:${CONTACTO_PRIVACIDAD}`}
		>
			{CONTACTO_PRIVACIDAD}
		</a>
	);
}

export default function PoliticaPrivacidadPage() {
	// `null` mientras el dato siga siendo de relleno — ver `EMPRESA_PENDIENTE`.
	const rut = datoEmpresa('rut');
	const domicilio =
		[datoEmpresa('direccion'), datoEmpresa('comuna'), datoEmpresa('ciudad')]
			.filter(Boolean)
			.join(', ') || null;

	return (
		<main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
			<header>
				<h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
					Política de privacidad
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					{EMPRESA.razonSocial} · Versión {VERSION} · Última actualización: {ACTUALIZADA}
				</p>
			</header>

			<p className="mt-6 text-sm leading-relaxed text-muted-foreground">
				{EMPRESA.razonSocial} ({EMPRESA.giro.toLowerCase()}) trata datos personales para
				administrar su producción. GonsAdmin es el sistema interno donde ocurre ese
				tratamiento. Esta política explica qué datos tratamos, de quién, con qué finalidad y
				con qué fundamento legal, con quién se comparten, cuánto se conservan y cómo ejercer
				los derechos que la ley reconoce.
			</p>

			<Seccion id="responsable" titulo="1. Quién es el responsable">
				<p>
					{terminar(
						`El responsable del tratamiento es ${EMPRESA.razonSocial}` +
							(rut ? `, RUT ${rut}` : '') +
							(domicilio ? `, con domicilio en ${domicilio}` : ''),
					)}{' '}
					Para cualquier consulta sobre esta política, o para ejercer tus derechos, escribe a{' '}
					<Correo />. Ese es el único canal: no hay formulario ni teléfono dedicado, y una
					solicitud enviada ahí queda registrada.
				</p>
			</Seccion>

			<Seccion id="personal" titulo="2. Datos del personal de la imprenta">
				<p>De quienes trabajan en la imprenta tratamos:</p>
				<ul className="list-disc space-y-1 pl-5">
					<li>identificación y contacto: nombre, correo, teléfono y contacto de emergencia;</li>
					<li>
						el contrato de trabajo y sus condiciones: tipo de jornada, horas semanales, topes
						de horas extra y fechas de inicio y término;
					</li>
					<li>remuneración: tarifa por hora, recargos, bonos e incentivos, y su historial;</li>
					<li>
						marcas de entrada y salida en las estaciones, y el código de la credencial con que
						se registran;
					</li>
					<li>competencias y certificaciones, con su fecha de evaluación y de vencimiento;</li>
					<li>licencias, permisos y ausencias, y los documentos de personal que la ley obliga a conservar.</li>
				</ul>
				<p>
					<strong className="text-foreground">Fundamento legal:</strong> la ejecución del
					contrato de trabajo y el cumplimiento de las obligaciones laborales, previsionales y
					tributarias que la ley impone al empleador. No pedimos tu consentimiento para esto
					porque no es la base que corresponde: son datos sin los cuales no se puede pagar un
					sueldo ni cumplir la ley.
				</p>
				<p>
					<strong className="text-foreground">
						Las marcas de entrada y salida no son el registro legal de asistencia.
					</strong>{' '}
					Se usan para atribuir horas a cada orden de trabajo y calcular el costo de
					producción. El control de asistencia que exige la normativa laboral se lleva por la
					vía que la empresa tenga dispuesta para ese efecto, no por este sistema.
				</p>
			</Seccion>

			<Seccion id="clientes" titulo="3. Datos de clientes y proveedores">
				<p>
					De nuestros clientes y proveedores —y, cuando son empresas, de las personas que los
					representan— tratamos el nombre, el RUT, la dirección, el correo y el teléfono de
					contacto, junto con el historial de cotizaciones, órdenes de trabajo, despachos y
					facturas asociados.
				</p>
				<p>
					<strong className="text-foreground">Fundamento legal:</strong> la ejecución del
					contrato o la preparación de una cotización solicitada, y el cumplimiento de las
					obligaciones contables y tributarias. No usamos estos datos para publicidad ni los
					cedemos a terceros con fines comerciales.
				</p>
			</Seccion>

			<Seccion id="whatsapp" titulo="4. Datos que llegan por el canal de WhatsApp">
				<p>
					El número de WhatsApp de la imprenta recibe reportes de trabajo enviados por
					personal de planta. De cada mensaje recibimos:
				</p>
				<ul className="list-disc space-y-1 pl-5">
					<li>el número de teléfono y el nombre de perfil de WhatsApp de quien lo envía;</li>
					<li>el contenido del mensaje: texto y, si se adjuntan, fotos o documentos;</li>
					<li>la fecha y hora del mensaje y su identificador técnico asignado por WhatsApp.</li>
				</ul>
				<p>Con eso:</p>
				<ul className="list-disc space-y-1 pl-5">
					<li>identificamos a la persona que reporta, comparando su número con la ficha de personal;</li>
					<li>
						registramos el avance de órdenes de trabajo y de mantención —inicio, término,
						cantidades, horas e incidencias— para el control de producción y de costos;
					</li>
					<li>guardamos las fotos como evidencia del trabajo informado.</li>
				</ul>
				<p>
					<strong className="text-foreground">Fundamento legal:</strong> la ejecución del
					contrato de trabajo, del que este canal es un instrumento. No solicitamos datos
					sensibles por aquí, y te pedimos no enviar información personal que el reporte no
					necesite. No usamos estos datos con fines publicitarios, no los vendemos y no
					enviamos mensajes promocionales.
				</p>
			</Seccion>

			<Seccion id="origen" titulo="5. De dónde provienen los datos">
				<p>
					Los datos los entrega la propia persona —al ser contratada, al cotizar, o al enviar
					un reporte— o se generan por el uso del sistema: una marca de reloj, una hora
					cargada a una orden, una foto adjunta. No compramos bases de datos ni obtenemos
					datos personales de terceros.
				</p>
			</Seccion>

			<Seccion id="destinatarios" titulo="6. Con quién se comparten y transferencias internacionales">
				<p>
					Solo con los proveedores que hacen funcionar el servicio, y únicamente para ese fin:
				</p>
				<ul className="list-disc space-y-1 pl-5">
					<li>Meta Platforms, Inc. (WhatsApp Business Platform), que transmite los mensajes;</li>
					<li>Supabase, que aloja la base de datos;</li>
					<li>Vercel, que aloja la aplicación;</li>
					<li>servicios de monitoreo de errores técnicos de la aplicación;</li>
					<li>
						y, cuando la ley lo exige, los organismos públicos competentes y nuestros asesores
						contables y laborales.
					</li>
				</ul>
				<p>
					<strong className="text-foreground">Transferencias internacionales:</strong> la base
					de datos y la aplicación están alojadas en Estados Unidos, y Meta procesa los
					mensajes fuera de Chile. Esos proveedores tratan los datos por cuenta nuestra y
					sujetos a sus propios compromisos contractuales de seguridad y confidencialidad.
				</p>
				<p>
					Si incorporamos nuevos proveedores —por ejemplo para transcribir notas de voz o
					interpretar reportes de forma automática— o cambiamos qué datos se almacenan,
					actualizaremos esta política antes de hacerlo.
				</p>
			</Seccion>

			<Seccion id="conservacion" titulo="7. Cuánto tiempo se conservan">
				<ul className="list-disc space-y-1 pl-5">
					<li>
						<strong className="text-foreground">Personal:</strong> durante la relación laboral
						y después por los plazos que la legislación laboral, previsional y tributaria
						exige conservar cada documento.
					</li>
					<li>
						<strong className="text-foreground">Clientes y documentos tributarios:</strong> por
						los plazos de la normativa contable y tributaria.
					</li>
					<li>
						<strong className="text-foreground">Trazabilidad de producción:</strong> cinco años,
						por el estándar FSSC 22000 que rige la trazabilidad de envases y etiquetas.
					</li>
					<li>
						<strong className="text-foreground">Reportes de WhatsApp:</strong> mientras sean
						necesarios para el control de producción de la orden a la que corresponden. Los
						mensajes que no corresponden a un reporte válido no se incorporan a los registros
						de producción.
					</li>
				</ul>
				<p>
					Cumplido el plazo, los datos se eliminan o se anonimizan. Si necesitas el plazo
					exacto aplicable a un dato tuyo, pídelo a <Correo /> y te lo indicamos.
				</p>
			</Seccion>

			<Seccion id="decisiones" titulo="8. Decisiones automatizadas">
				<p>
					GonsAdmin calcula estimaciones y sugiere asignaciones de turno según las
					competencias acreditadas de cada persona. Son apoyos para quien decide:{' '}
					<strong className="text-foreground">
						ninguna decisión que te afecte —una asignación, una evaluación, una remuneración—
						se toma de forma automatizada sin intervención humana
					</strong>
					, y el sistema no elabora perfiles con fines distintos de los descritos aquí.
				</p>
			</Seccion>

			<Seccion id="seguridad" titulo="9. Seguridad">
				<p>
					El acceso a GonsAdmin requiere usuario y contraseña, y los permisos se asignan por
					rol: las pantallas de remuneración y de datos de personal están restringidas a
					administración y a Recursos Humanos. Las comunicaciones viajan cifradas (HTTPS), la
					base de datos aplica control de acceso por fila, y la aplicación verifica la firma
					de cada notificación que recibe desde WhatsApp antes de procesarla.
				</p>
				<p>
					Ningún sistema es infalible. Si detectamos una vulneración que afecte tus datos y
					que implique un riesgo para tus derechos, te lo informaremos y lo comunicaremos a la
					autoridad en los plazos que la ley establezca.
				</p>
			</Seccion>

			<Seccion id="derechos" titulo="10. Tus derechos">
				<p>Sobre tus datos personales puedes ejercer los siguientes derechos:</p>
				<ul className="list-disc space-y-1 pl-5">
					<li>
						<strong className="text-foreground">Acceso:</strong> saber qué datos tuyos tratamos
						y obtener una copia.
					</li>
					<li>
						<strong className="text-foreground">Rectificación:</strong> corregir datos
						inexactos, desactualizados o incompletos.
					</li>
					<li>
						<strong className="text-foreground">Supresión:</strong> pedir su eliminación cuando
						ya no sean necesarios o no exista obligación legal de conservarlos.
					</li>
					<li>
						<strong className="text-foreground">Oposición:</strong> oponerte a un tratamiento
						determinado, en los casos que la ley permite.
					</li>
					<li>
						<strong className="text-foreground">Portabilidad:</strong> recibir tus datos en un
						formato estructurado y de uso común, o pedir que se transfieran a otro
						responsable.
					</li>
					<li>
						<strong className="text-foreground">Bloqueo:</strong> pedir la suspensión temporal
						del tratamiento mientras se resuelve una solicitud de rectificación, supresión u
						oposición.
					</li>
				</ul>
				<p>
					Para ejercerlos, escribe a <Correo /> indicando tu nombre completo —o el número de
					teléfono, si tu solicitud es sobre el canal de WhatsApp— y qué derecho quieres
					ejercer. Responderemos dentro de los plazos legales. Ejercer un derecho es gratuito.
				</p>
				<p>
					Donde el tratamiento se funde en tu consentimiento, puedes retirarlo en cualquier
					momento por el mismo canal, sin que eso afecte la licitud del tratamiento anterior.
					La mayor parte de lo descrito en esta política no se funda en consentimiento sino en
					el contrato y en obligaciones legales, así que retirarlo no detiene esos
					tratamientos.
				</p>
				<p>
					<strong className="text-foreground">Reclamo ante la autoridad:</strong> si consideras
					que no hemos atendido correctamente tu solicitud, puedes reclamar ante la Agencia de
					Protección de Datos Personales.
				</p>
			</Seccion>

			<Seccion id="cambios" titulo="11. Cambios a esta política">
				<p>
					Si modificamos esta política, publicaremos la nueva versión en esta misma dirección,
					con su número de versión y su fecha de actualización. Los cambios relevantes para
					quienes ya nos entregaron datos se comunicarán por el canal habitual de contacto.
				</p>
			</Seccion>

			<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
				<p>
					{EMPRESA.razonSocial}
					{rut ? ` · RUT ${rut}` : ''} · GonsAdmin ·{' '}
					<Link className="text-primary underline underline-offset-2" href="/login">
						Volver al inicio
					</Link>
				</p>
			</footer>
		</main>
	);
}
