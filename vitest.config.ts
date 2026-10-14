import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		environment: 'node',
		globals: true,
		/**
		 * 15 s en vez de los 5 s por defecto.
		 *
		 * No es para tapar pruebas lentas: es porque las que fallaban no eran
		 * lentas. El 2026-10-14 la suite falló dos veces de forma intermitente,
		 * siempre al correr `tsc`, `eslint` y `vitest` en el mismo comando, y
		 * siempre por timeout — una vez en `auth.test.ts` («con un secreto real,
		 * importa limpio», que sola tarda 239 ms) y otra en `qr-from-photo`
		 * («una etiqueta chica dentro de una foto grande», 1567 ms). Con la
		 * máquina cargada el `import` de la suite pasó de ~17 s a ~137 s, y esos
		 * dos cruzaron los 5 s sin que nada estuviera roto.
		 *
		 * Una prueba que se pone roja según qué más esté corriendo en la máquina
		 * no informa nada, y entrena a leer el rojo como ruido — que es
		 * exactamente cómo `NOTES.md` §12 cuenta que pasaron semanas de builds
		 * fallados sin que nadie mirara. El margen es para la carga, no para la
		 * lógica: las aserciones no cambian.
		 *
		 * Importa además para CI, donde el runner es más lento que esta máquina.
		 * La prueba más pesada (`lee una foto del tamaño que saca un teléfono`,
		 * ~6 s) ya traía su propio `20_000` y sigue mandando sobre esto.
		 */
		testTimeout: 15_000,
	},
});
