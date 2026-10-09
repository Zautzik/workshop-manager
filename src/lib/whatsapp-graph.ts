/**
 * La versión del Graph API, en un solo lugar.
 *
 * `v20.0` estaba escrita a mano en tres lugares distintos —resolver un id de
 * media, bajar los bytes, mandar un mensaje— y **venció el 2026-09-24**. Meta
 * la publicó el 2024-05-21 con esa fecha de expiración en su changelog de
 * versiones; no es mantención preventiva, es una dependencia ya vencida que
 * sigue en producción (auditoría de captura 2026-10, H5).
 *
 * Lo que una llamada a una versión vencida hace no está garantizado: Meta
 * suele subirla sola a la más vieja disponible, pero «suele» no es un
 * contrato, y el día que deje de hacerlo se cae lo único que el taller usa
 * para avisar algo —el envío de mensajes— sin que nadie haya tocado el código.
 *
 * Por qué un módulo y no una constante exportada desde cualquiera de los tres:
 * el header de `whatsapp-media.ts` ya había previsto exactamente este problema
 * cuando se extrajo `resolveMetaMediaUrl` ahí («duplicar la llamada al Graph
 * API en el segundo lector habría sido la forma segura de que un día una de
 * las dos copias siga usando v20.0 y la otra no»). La predicción se cumplió:
 * `whatsapp-ingest.ts` se quedó con una copia privada e idéntica de esa misma
 * función. Esta vez la versión vive en un módulo que no depende de ninguno de
 * los dos, así que no hay un «segundo lector» que pueda quedarse atrás.
 *
 * Al subir de versión: leer el changelog, no este comentario.
 * https://developers.facebook.com/docs/graph-api/changelog/versions
 */

/**
 * Versión fijada a mano, nunca desde una variable de entorno.
 *
 * Una versión del Graph API no es configuración: cambiarla puede cambiar la
 * forma del payload, así que el cambio tiene que pasar por un diff y por los
 * tests, no por el panel de Vercel. Que sea un literal es lo que hace que
 * `grep` encuentre todos los lugares afectados.
 *
 * v25.0 (publicada 2026-02-18, disponible hasta 2028-07-29) es la de mayor
 * horizonte entre las ya maduras — v26.0 es de 2026-07-29 y no aporta nada
 * que acá se use.
 */
export const GRAPH_VERSION = 'v25.0';

const GRAPH_BASE = 'https://graph.facebook.com';

/**
 * Arma una URL del Graph API.
 *
 * `path` va sin la barra inicial y **ya escapado** por quien llama: los ids de
 * Meta se escapan con `encodeURIComponent`, pero un path con varios segmentos
 * (`<phone-number-id>/messages`) no se puede escapar entero sin romper la
 * barra que lo separa. Dejarlo en manos del que llama es lo honesto; esconderlo
 * acá invitaría a escapar de más y a mandar `%2F` a Meta.
 */
export function graphUrl(path: string): string {
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${path}`;
}
