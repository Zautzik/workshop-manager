'use client';

/**
 * La silueta del producto, dibujada como un troquel.
 *
 * Las tarjetas de «Tipo de trabajo» eran un emoji, un título y dos líneas de
 * descripción. Un impresor no reconoce un producto por su descripción — lo
 * reconoce por su TROQUEL: la línea de corte llena y la de hendido punteada.
 * Es el dibujo que ve todos los días y lo lee en un cuarto de segundo.
 *
 * Por eso acá no hay fotos de stock ni iconos genéricos. Hay diecicuatro
 * siluetas dibujadas con la convención del oficio:
 *
 *   ── línea llena      corte
 *   ┄┄ línea punteada   hendido o plegado
 *
 * Son SVG en línea, no archivos: la política de contenido de esta app bloquea
 * cualquier recurso externo, y una imagen que no carga es peor que ninguna.
 */

interface Props {
	kind: string;
	/** Se hereda del color de la tarjeta para que el troquel siga a la selección. */
	className?: string;
	style?: React.CSSProperties;
}

/** Trazo de corte: continuo. */
const CORTE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' as const };
/** Trazo de hendido: punteado, como en un plano de troquel. */
const HENDIDO = { ...CORTE, strokeWidth: 1, strokeDasharray: '3 2.5', opacity: 0.65 };

function Shape({ kind }: { kind: string }) {
	switch (kind) {
		case 'etiqueta':
			// Etiqueta troquelada con esquinas redondeadas.
			return (
				<>
					<rect x="8" y="14" width="32" height="20" rx="4" {...CORTE} />
					<line x1="12" y1="20" x2="28" y2="20" {...HENDIDO} />
					<line x1="12" y1="25" x2="34" y2="25" {...HENDIDO} />
				</>
			);
		case 'estuche':
		case 'caja_plegadiza':
			// Estuche desplegado: cuerpo, tapas y solapa de pegado.
			return (
				<>
					<path d="M10 12h28v24H10z" {...CORTE} />
					<path d="M10 12l-4 4v16l4 4" {...CORTE} />
					<path d="M38 12l4 4v16l-4 4" {...CORTE} />
					<line x1="18" y1="12" x2="18" y2="36" {...HENDIDO} />
					<line x1="30" y1="12" x2="30" y2="36" {...HENDIDO} />
				</>
			);
		case 'caja_display':
			// Display de mostrador: bandeja al frente y respaldo alto.
			return (
				<>
					<path d="M8 20h32v16H8z" {...CORTE} />
					<path d="M12 20V10h24v10" {...CORTE} />
					<line x1="8" y1="27" x2="40" y2="27" {...HENDIDO} />
					<path d="M16 10h16" {...HENDIDO} />
				</>
			);
		case 'afiche':
			return (
				<>
					<rect x="12" y="8" width="24" height="32" rx="1" {...CORTE} />
					<rect x="16" y="12" width="16" height="12" {...HENDIDO} />
					<line x1="16" y1="29" x2="32" y2="29" {...HENDIDO} />
					<line x1="16" y1="33" x2="27" y2="33" {...HENDIDO} />
				</>
			);
		case 'libro':
			// Lomo cuadrado: encuadernación fresada.
			return (
				<>
					<path d="M12 10h24v28H12z" {...CORTE} />
					<path d="M12 10c-3 1-3 26 0 28" {...CORTE} />
					<line x1="17" y1="10" x2="17" y2="38" {...HENDIDO} />
					<line x1="22" y1="18" x2="32" y2="18" {...HENDIDO} />
					<line x1="22" y1="23" x2="32" y2="23" {...HENDIDO} />
				</>
			);
		case 'revista':
			// Grapa al lomo.
			return (
				<>
					<path d="M24 10h14v28H24z" {...CORTE} />
					<path d="M24 10H10v28h14" {...CORTE} />
					<line x1="24" y1="10" x2="24" y2="38" {...HENDIDO} />
					<path d="M22.5 17h3M22.5 31h3" {...CORTE} strokeWidth={2} />
				</>
			);
		case 'folleto':
			// Tríptico: dos hendidos paralelos.
			return (
				<>
					<rect x="6" y="14" width="36" height="20" {...CORTE} />
					<line x1="18" y1="14" x2="18" y2="34" {...HENDIDO} />
					<line x1="30" y1="14" x2="30" y2="34" {...HENDIDO} />
				</>
			);
		case 'volante':
			return (
				<>
					<rect x="14" y="9" width="20" height="30" {...CORTE} />
					<line x1="18" y1="16" x2="30" y2="16" {...HENDIDO} />
					<line x1="18" y1="21" x2="30" y2="21" {...HENDIDO} />
					<line x1="18" y1="26" x2="26" y2="26" {...HENDIDO} />
				</>
			);
		case 'carpeta':
			// Carpeta con bolsillo y ranura para tarjeta.
			return (
				<>
					<path d="M8 10h32v28H8z" {...CORTE} />
					<line x1="24" y1="10" x2="24" y2="38" {...HENDIDO} />
					<path d="M26 26h12v12H26z" {...CORTE} />
					<path d="M29 29h5" {...CORTE} />
				</>
			);
		case 'sobre':
			return (
				<>
					<rect x="7" y="14" width="34" height="21" rx="1" {...CORTE} />
					<path d="M7 14l17 12 17-12" {...HENDIDO} />
					<path d="M7 35l12-9M41 35l-12-9" {...HENDIDO} />
				</>
			);
		case 'talonario':
			// Bloques con numeración y línea de perforado.
			return (
				<>
					<rect x="12" y="10" width="24" height="28" {...CORTE} />
					<line x1="12" y1="18" x2="36" y2="18" {...HENDIDO} strokeDasharray="1.5 2" />
					<line x1="17" y1="25" x2="31" y2="25" {...HENDIDO} />
					<line x1="17" y1="30" x2="27" y2="30" {...HENDIDO} />
					<circle cx="31" cy="14" r="2.5" {...CORTE} strokeWidth={1} />
				</>
			);
		case 'calendario':
			return (
				<>
					<rect x="9" y="13" width="30" height="26" rx="1.5" {...CORTE} />
					<line x1="9" y1="21" x2="39" y2="21" {...CORTE} />
					<path d="M16 13V9M32 13V9" {...CORTE} />
					<line x1="16" y1="27" x2="32" y2="27" {...HENDIDO} />
					<line x1="16" y1="32" x2="32" y2="32" {...HENDIDO} />
				</>
			);
		default:
			// Un pliego sin troquel definido: el caso «otro».
			return (
				<>
					<rect x="10" y="12" width="28" height="24" {...CORTE} strokeDasharray="4 3" />
					<path d="M20 24h8M24 20v8" {...CORTE} />
				</>
			);
	}
}

export function DieLine({ kind, className, style }: Props) {
	return (
		<svg
			viewBox="0 0 48 48"
			className={className}
			style={style}
			aria-hidden="true"
			focusable="false"
		>
			<Shape kind={kind} />
		</svg>
	);
}
