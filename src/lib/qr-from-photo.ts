/**
 * Leer el código de una FOTO.
 *
 * Bodega no escribe. Tiene guantes, tiene las manos ocupadas y está de pie al
 * lado de un pallet: escribir «WHLOT:8f6c3e1e-...» en un teléfono es una tarea
 * que no se va a hacer, y eso convierte cualquier trazabilidad que dependa de
 * ella en una intención. Sacar una foto sí se hace — es el gesto que ya hacen
 * todo el día para mandar cualquier cosa por WhatsApp.
 *
 * Hasta ahora una foto sin texto se descartaba antes de llegar a ningún lado
 * (`extractMetaInbound` la contaba como `ignored`), así que la etiqueta impresa
 * que el sistema mismo genera no servía de nada por el canal donde vive la
 * gente. Este módulo es el traductor que faltaba: píxeles adentro, el texto del
 * código afuera.
 *
 * ── Por qué JS puro y no `sharp` ────────────────────────────────────────────
 *
 * `sharp` está en node_modules porque Next lo arrastra, y es tentador usarlo:
 * decodifica todo y es rápido. Pero es un binario nativo que nadie declaró como
 * dependencia — el día que Next deje de traerlo, esto deja de funcionar en
 * producción sin que ningún test lo note. `jpeg-js` + `pngjs` + `jsqr` son tres
 * paquetes JS puros, sin compilación, que arrancan en frío en una función
 * serverless sin sorpresas. La foto de una etiqueta no necesita más.
 */

import jsQR from 'jsqr';
import { decode as decodeJpeg } from 'jpeg-js';
import { PNG } from 'pngjs';

/**
 * Lado máximo al que se reduce la foto antes de buscar el código.
 *
 * Una foto de teléfono son 4000×3000: 48 MB de RGBA que hay que recorrer varias
 * veces. Bajarla a 1400 la deja en ~7 MB y no pierde el código, porque una
 * etiqueta fotografiada de cerca ocupa buena parte del cuadro. Si el código
 * fuera tan chico que 1400 lo pierde, a 4000 también saldría borroso: el
 * problema sería la foto, no la resolución.
 */
const LADO_MAX = 1400;

/**
 * Cuántos píxeles se aceptan decodificar.
 *
 * `jpeg-js` no puede decodificar a escala reducida: para mirar una foto hay que
 * expandirla entera a RGBA en memoria, y eso crece con el cuadrado del lado. Lo
 * medido en esta máquina: 2000 px pide 128 MB, 3000 px pide 192 MB y 4000 px
 * pide 384 MB. En una función serverless con un presupuesto de 1 GB compartido
 * con Next, reservar 384 MB por una foto es cómo se muere el proceso.
 *
 * 9 MP (3000×3000) deja un margen de más de tres veces sobre lo que el canal
 * entrega de verdad: WhatsApp reescala las FOTOS a ~1600 px de lado antes de
 * mandarlas. Lo que llega más grande que esto es una foto enviada COMO ARCHIVO,
 * que conserva el original — y eso tiene una respuesta concreta que darle a
 * quien la mandó.
 */
const MAX_PIXELES = 9_000_000;

/**
 * Red de seguridad del decodificador, no el límite real.
 *
 * El límite lo pone `MAX_PIXELES`, que se comprueba ANTES de reservar nada
 * leyendo el tamaño de la cabecera. Esto sólo ataja una imagen cuya cabecera
 * mienta sobre sus dimensiones.
 */
const MAX_JPEG_MB = 256;

export interface QRLeido {
	ok: boolean;
	/** El texto crudo del código. Interpretarlo es de otro. */
	value: string | null;
	/** Qué decirle a quien sacó la foto. En su idioma, y accionable. */
	problem: string | null;
}

interface Imagen {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

const esJpeg = (mime: string) => /jpe?g/i.test(mime);
const esPng = (mime: string) => /png/i.test(mime);

/**
 * El tamaño de la imagen SIN decodificarla.
 *
 * Se lee de la cabecera, que son unas pocas decenas de bytes. Preguntar primero
 * es la diferencia entre rechazar una foto enorme con un mensaje útil y
 * quedarse sin memoria a mitad de camino — que en serverless no es una
 * excepción que se pueda atrapar, es el proceso que desaparece.
 */
export function imageSize(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
	try {
		if (esPng(mime)) {
			// IHDR va siempre primero: ancho y alto en los bytes 16..23.
			if (bytes.length < 24) return null;
			const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			return { width: view.getUint32(16), height: view.getUint32(20) };
		}

		// JPEG: recorrer los marcadores hasta el SOF, que es el que declara el
		// tamaño. Los SOF son 0xC0–0xCF salvo C4 (Huffman), C8 (extensión) y CC
		// (aritmética), que no describen la imagen.
		if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
		let i = 2;
		while (i + 9 < bytes.length) {
			if (bytes[i] !== 0xff) { i += 1; continue; }
			const marker = bytes[i + 1];
			if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
				i += 2;
				continue;
			}
			const len = (bytes[i + 2] << 8) | bytes[i + 3];
			if (len < 2) return null;
			const esSOF = marker >= 0xc0 && marker <= 0xcf
				&& marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
			if (esSOF) {
				return {
					height: (bytes[i + 5] << 8) | bytes[i + 6],
					width: (bytes[i + 7] << 8) | bytes[i + 8],
				};
			}
			i += 2 + len;
		}
		return null;
	} catch {
		return null;
	}
}

function aRGBA(bytes: Uint8Array, mime: string): Imagen | null {
	try {
		if (esPng(mime)) {
			const png = PNG.sync.read(Buffer.from(bytes));
			return {
				data: new Uint8ClampedArray(png.data),
				width: png.width,
				height: png.height,
			};
		}
		// El resto se intenta como JPEG: es lo que manda una cámara de teléfono,
		// y Meta convierte a JPEG casi todo lo que pasa por el canal.
		const jpg = decodeJpeg(Buffer.from(bytes), {
			useTArray: true,
			maxMemoryUsageInMB: MAX_JPEG_MB,
			formatAsRGBA: true,
		});
		return {
			data: new Uint8ClampedArray(jpg.data),
			width: jpg.width,
			height: jpg.height,
		};
	} catch {
		return null;
	}
}

/**
 * Reducir por muestreo de a saltos.
 *
 * Un promedio de vecinos daría una imagen más linda y un código PEOR: promediar
 * difumina justamente el borde entre el módulo negro y el blanco, que es lo
 * único que el lector mira. Tomar un píxel de cada N conserva el contraste duro.
 */
function reducir(img: Imagen, ladoMax: number): Imagen {
	const mayor = Math.max(img.width, img.height);
	if (mayor <= ladoMax) return img;

	const paso = Math.ceil(mayor / ladoMax);
	const w = Math.floor(img.width / paso);
	const h = Math.floor(img.height / paso);
	const out = new Uint8ClampedArray(w * h * 4);

	for (let y = 0; y < h; y++) {
		const filaOrigen = y * paso * img.width;
		const filaDestino = y * w;
		for (let x = 0; x < w; x++) {
			const o = (filaOrigen + x * paso) * 4;
			const d = (filaDestino + x) * 4;
			out[d] = img.data[o];
			out[d + 1] = img.data[o + 1];
			out[d + 2] = img.data[o + 2];
			out[d + 3] = img.data[o + 3];
		}
	}
	return { data: out, width: w, height: h };
}

function buscar(img: Imagen): string | null {
	// `attemptBoth` para la etiqueta impresa en negativo y para la foto sacada
	// contra una luz que invierte el contraste. Cuesta una pasada más y evita el
	// «no se leyó» más frustrante: el del código que se ve perfecto.
	const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
	const value = found?.data?.trim();
	return value ? value : null;
}

/**
 * El texto del código que hay en esta foto, si lo hay.
 *
 * Intenta dos tamaños. El reducido primero porque es el que funciona casi
 * siempre y cuesta la décima parte; el original después, para el caso del
 * código chico o lejano donde bajar la resolución sí lo borra.
 */
export function decodeQRFromImage(bytes: Uint8Array, mime = 'image/jpeg'): QRLeido {
	if (bytes.byteLength === 0) {
		return { ok: false, value: null, problem: 'La foto llegó vacía. Probá de nuevo.' };
	}

	if (!esJpeg(mime) && !esPng(mime)) {
		return {
			ok: false,
			value: null,
			problem: 'Ese archivo no es una foto. Sacale una foto a la etiqueta con la cámara.',
		};
	}

	// El tamaño se pregunta antes de reservar un solo byte. Una cabecera
	// ilegible no frena: puede ser un formato raro que el decodificador sí
	// entienda, y rechazar por no saber sería peor que intentarlo.
	const size = imageSize(bytes, mime);
	if (size && size.width * size.height > MAX_PIXELES) {
		return {
			ok: false,
			value: null,
			problem:
				`Esa foto es de ${size.width}×${size.height} y es demasiado grande para leerla. ` +
				'Mandala como FOTO y no como archivo — WhatsApp la achica sola y el código se lee igual.',
		};
	}

	const img = aRGBA(bytes, mime);
	if (!img) {
		return { ok: false, value: null, problem: 'No se pudo abrir la foto. Sacala de nuevo.' };
	}

	const chica = reducir(img, LADO_MAX);
	const valor = buscar(chica) ?? (chica === img ? null : buscar(img));

	if (!valor) {
		return {
			ok: false,
			value: null,
			problem:
				'No se ve el código en la foto. Acercate a la etiqueta, que entre entera y ' +
				'enfocada, y sacala de nuevo.',
		};
	}

	return { ok: true, value: valor, problem: null };
}
