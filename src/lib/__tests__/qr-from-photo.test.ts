import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { encode as encodeJpeg, decode as decodeJpeg } from 'jpeg-js';
import { PNG } from 'pngjs';
import { decodeQRFromImage, imageSize } from '@/lib/qr-from-photo';
import { encodeLotQR } from '@/lib/traceability';

const LOTE = '8f6c3e1e-d9cf-4858-bd55-741cfcde1d2b';

const png = (text: string, width = 600) =>
	QRCode.toBuffer(text, { type: 'png', width, margin: 2 });

/** Un PNG convertido a JPEG: lo que realmente llega desde un teléfono. */
async function jpeg(text: string, width = 600, quality = 80): Promise<Uint8Array> {
	const raw = PNG.sync.read(await png(text, width));
	return encodeJpeg({ data: raw.data, width: raw.width, height: raw.height }, quality).data;
}

/** Pegar el código dentro de una foto más grande, como una etiqueta en un pallet. */
async function enUnaFoto(text: string, codigo: number, foto: number): Promise<Uint8Array> {
	const qr = PNG.sync.read(await png(text, codigo));
	const lienzo = new PNG({ width: foto, height: foto });
	lienzo.data.fill(210); // cartón, no blanco puro
	const dx = Math.floor((foto - qr.width) / 2);
	const dy = Math.floor((foto - qr.height) / 2);
	for (let y = 0; y < qr.height; y++) {
		for (let x = 0; x < qr.width; x++) {
			const o = (y * qr.width + x) * 4;
			const d = ((y + dy) * foto + (x + dx)) * 4;
			lienzo.data[d] = qr.data[o];
			lienzo.data[d + 1] = qr.data[o + 1];
			lienzo.data[d + 2] = qr.data[o + 2];
			lienzo.data[d + 3] = 255;
		}
	}
	const raw = PNG.sync.read(PNG.sync.write(lienzo));
	return encodeJpeg({ data: raw.data, width: raw.width, height: raw.height }, 85).data;
}

describe('decodeQRFromImage — la foto de la etiqueta', () => {
	it('lee el código de lote que imprime el sistema, en PNG', async () => {
		const r = decodeQRFromImage(await png(encodeLotQR(LOTE)), 'image/png');
		expect(r.ok).toBe(true);
		expect(r.value).toBe(encodeLotQR(LOTE));
	});

	it('lo lee en JPEG, que es lo que manda un teléfono', async () => {
		const r = decodeQRFromImage(await jpeg(encodeLotQR(LOTE)), 'image/jpeg');
		expect(r.ok).toBe(true);
		expect(r.value).toBe(encodeLotQR(LOTE));
	});

	it('sobrevive a la compresión que aplica WhatsApp', async () => {
		// Calidad 45: bastante peor de lo que manda el canal en la práctica.
		const r = decodeQRFromImage(await jpeg(encodeLotQR(LOTE), 600, 45), 'image/jpeg');
		expect(r.ok).toBe(true);
		expect(r.value).toBe(encodeLotQR(LOTE));
	});

	it('lee una etiqueta chica dentro de una foto grande', async () => {
		// El caso real: el pallet ocupa el cuadro y la etiqueta es una parte.
		const r = decodeQRFromImage(await enUnaFoto(encodeLotQR(LOTE), 500, 2000), 'image/jpeg');
		expect(r.ok).toBe(true);
		expect(r.value).toBe(encodeLotQR(LOTE));
	});

	it('lee también las etiquetas de material, con su acción adentro', async () => {
		const valor = `WH:USE:${LOTE}:40502`;
		const r = decodeQRFromImage(await jpeg(valor), 'image/jpeg');
		expect(r.value).toBe(valor);
	});

	// Una foto de 4000 px es lo que sale de una cámara de teléfono: si el
	// reductor rompiera el código, este caso lo muestra.
	it('lee una foto del tamaño que saca un teléfono', async () => {
		const r = decodeQRFromImage(await enUnaFoto(encodeLotQR(LOTE), 900, 3000), 'image/jpeg');
		expect(r.ok).toBe(true);
		expect(r.value).toBe(encodeLotQR(LOTE));
	}, 20_000);
});

describe('decodeQRFromImage — cuando no se puede', () => {
	it('una foto sin código dice qué hacer, no «error»', async () => {
		const liso = new PNG({ width: 400, height: 400 });
		liso.data.fill(200);
		const raw = PNG.sync.read(PNG.sync.write(liso));
		const plano = encodeJpeg({ data: raw.data, width: raw.width, height: raw.height }, 80).data;

		const r = decodeQRFromImage(plano, 'image/jpeg');
		expect(r.ok).toBe(false);
		expect(r.problem).toContain('Acercate');
	});

	it('un archivo vacío no revienta', () => {
		const r = decodeQRFromImage(new Uint8Array(0), 'image/jpeg');
		expect(r.ok).toBe(false);
		expect(r.problem).toContain('vacía');
	});

	it('un audio o un PDF se rechaza con la instrucción correcta', () => {
		const r = decodeQRFromImage(new Uint8Array([1, 2, 3]), 'application/pdf');
		expect(r.ok).toBe(false);
		expect(r.problem).toContain('foto a la etiqueta');
	});

	it('bytes que no son una imagen no revientan', () => {
		const r = decodeQRFromImage(new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]), 'image/jpeg');
		expect(r.ok).toBe(false);
		expect(r.problem).toBeTruthy();
	});
});

describe('imageSize — preguntar el tamaño antes de reservar memoria', () => {
	it('lee las dimensiones de un JPEG sin decodificarlo', async () => {
		expect(imageSize(await jpeg('WH:LOT:x', 240), 'image/jpeg')).toEqual({ width: 240, height: 240 });
	});

	it('lee las de un PNG', async () => {
		expect(imageSize(await png('WH:LOT:x', 240), 'image/png')).toEqual({ width: 240, height: 240 });
	});

	it('devuelve null si la cabecera no se entiende, para no frenar por no saber', () => {
		expect(imageSize(new Uint8Array([1, 2, 3, 4]), 'image/jpeg')).toBeNull();
	});

	it('rechaza una foto enorme con la instrucción concreta', () => {
		// Cabecera JPEG mínima que declara 5000×5000 = 25 MP. No hace falta la
		// imagen: el punto es que se rechaza SIN decodificarla.
		const cab = new Uint8Array([
			0xff, 0xd8,
			0xff, 0xc0, 0x00, 0x11, 0x08,
			0x13, 0x88, // alto 5000
			0x13, 0x88, // ancho 5000
			0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
		]);
		expect(imageSize(cab, 'image/jpeg')).toEqual({ width: 5000, height: 5000 });

		const r = decodeQRFromImage(cab, 'image/jpeg');
		expect(r.ok).toBe(false);
		expect(r.problem).toContain('5000×5000');
		expect(r.problem).toContain('como FOTO y no como archivo');
	});
});

describe('lo leído entra al lector de lotes que ya existía', () => {
	it('el código de la foto es exactamente lo que decodeLotQR espera', async () => {
		const { decodeLotQR } = await import('@/lib/traceability');
		const foto = decodeQRFromImage(await jpeg(encodeLotQR(LOTE)), 'image/jpeg');
		const lote = decodeLotQR(foto.value!);
		expect(lote.ok).toBe(true);
		expect(lote.lotId).toBe(LOTE);
	});

	it('una etiqueta de material se reconoce como QR del taller, no como lote', async () => {
		const { decodeLotQR } = await import('@/lib/traceability');
		const foto = decodeQRFromImage(await jpeg(`WH:CHK:${LOTE}`), 'image/jpeg');
		const lote = decodeLotQR(foto.value!);
		expect(lote.ok).toBe(false);
		expect(lote.problem).toBeTruthy();
	});
});

// Sanidad del andamio: si el generador de fotos de prueba se rompiera, los
// casos de arriba pasarían a probar otra cosa sin avisar.
describe('el andamio de las pruebas', () => {
	it('produce imágenes del tamaño que dice', async () => {
		const bytes = await enUnaFoto('WH:LOT:x', 300, 1200);
		const img = decodeJpeg(Buffer.from(bytes), { useTArray: true });
		expect(img.width).toBe(1200);
		expect(img.height).toBe(1200);
	});
});
