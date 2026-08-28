/**
 * Traer los bytes de una foto que llegó por WhatsApp.
 *
 * Existía dentro de `whatsapp-ingest`, enterrado en la función que guarda la
 * imagen como evidencia de una OT. Sale acá porque dejó de tener un solo
 * lector: bodega manda fotos que no son evidencia de nada todavía — son un
 * código que hay que leer antes de saber a qué OT pertenecen, si es que
 * pertenecen a alguna.
 *
 * Duplicar la llamada al Graph API en el segundo lector habría sido la forma
 * segura de que un día una de las dos copias siga usando `v20.0` y la otra no.
 */

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

export interface MediaEntrante {
	media_url?: string | null;
	media_id?: string | null;
	media_mime?: string | null;
}

export interface MediaDescargada {
	ok: boolean;
	bytes: Uint8Array | null;
	mime: string;
	problem: string | null;
}

/** Resolver un id de media de Meta a su URL de descarga, que dura poco. */
export async function resolveMetaMediaUrl(
	mediaId: string,
): Promise<{ url: string; mime: string | null } | null> {
	const token = process.env.WHATSAPP_ACCESS_TOKEN;
	if (!token) return null;
	const res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(mediaId)}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok) return null;
	const meta = (await res.json()) as { url?: string; mime_type?: string };
	return meta.url ? { url: meta.url, mime: meta.mime_type ?? null } : null;
}

/**
 * Los bytes, vengan de una URL directa (simulador) o de un id de Meta.
 *
 * Nunca lanza: el que llama está contestando un webhook y un error acá tiene
 * que poder volverse un mensaje para quien mandó la foto, no un 500 que hace
 * que Meta reintente el sobre entero.
 */
export async function fetchInboundMedia(input: MediaEntrante): Promise<MediaDescargada> {
	const fail = (problem: string): MediaDescargada => ({
		ok: false, bytes: null, mime: 'application/octet-stream', problem,
	});

	try {
		let url = input.media_url ?? null;
		let mime = input.media_mime ?? null;
		let headers: Record<string, string> = {};

		if (!url && input.media_id) {
			const resolved = await resolveMetaMediaUrl(input.media_id);
			if (!resolved) {
				return fail('No se pudo pedir la foto a WhatsApp (falta el token de acceso).');
			}
			url = resolved.url;
			mime = mime ?? resolved.mime;
			headers = { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` };
		}
		if (!url) return fail('El mensaje no traía ninguna foto.');

		const res = await fetch(url, { headers });
		if (!res.ok) return fail(`No se pudo bajar la foto (${res.status}). Mandala de nuevo.`);

		const contentType = mime ?? res.headers.get('content-type') ?? 'image/jpeg';
		const buf = new Uint8Array(await res.arrayBuffer());

		if (buf.byteLength === 0) return fail('La foto llegó vacía. Sacala de nuevo.');
		if (buf.byteLength > MAX_MEDIA_BYTES) {
			return fail('La foto pesa más de 8 MB. Mandala como foto y no como archivo.');
		}

		return { ok: true, bytes: buf, mime: contentType, problem: null };
	} catch {
		return fail('No se pudo bajar la foto. Mandala de nuevo.');
	}
}
