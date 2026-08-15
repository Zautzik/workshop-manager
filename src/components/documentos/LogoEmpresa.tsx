/**
 * La marca, dibujada en SVG.
 *
 * Es una marca tipográfica hecha acá, no el logo real de la imprenta: cuando
 * exista el archivo se reemplaza el contenido de este componente por un `<img>`
 * y ninguna plantilla se entera. Se hace en SVG y no como imagen para que
 * imprima nítido en cualquier tamaño — un logo pixelado en una cotización dice
 * más de la empresa que el precio.
 *
 * El símbolo son tres barras desfasadas: los cuatro cuerpos de una prensa
 * offset imprimiendo en registro. Es lo que hace el taller.
 */
export function LogoEmpresa({ className = '' }: { className?: string }) {
	return (
		<svg viewBox="0 0 240 56" className={className} role="img" aria-label="Imprenta Gons">
			{/* Las barras: cian, magenta y negro, el orden en que entran al pliego. */}
			<rect x="0" y="10" width="9" height="36" rx="1.5" fill="#0891b2" />
			<rect x="13" y="4" width="9" height="42" rx="1.5" fill="#be185d" />
			<rect x="26" y="16" width="9" height="30" rx="1.5" fill="#1f2937" />

			<text
				x="46"
				y="34"
				fontFamily="Georgia, 'Times New Roman', serif"
				fontSize="26"
				fontWeight="600"
				letterSpacing="-0.5"
				fill="#1f2937"
			>
				Imprenta Gons
			</text>
			<text
				x="47"
				y="47"
				fontFamily="system-ui, sans-serif"
				fontSize="8.5"
				letterSpacing="2.4"
				fill="#6b7280"
			>
				OFFSET · ENVASES · ETIQUETAS
			</text>
		</svg>
	);
}
