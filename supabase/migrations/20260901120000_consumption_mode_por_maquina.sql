-- Cómo se descuenta el papel cuando una OT pasa por esta máquina.
--
-- Hoy hay UNA sola forma: alguien escanea el QR del lote en /operaciones/escanear
-- y `consumir_lote` descuenta lo que esa persona tipeó. Funciona, pero depende
-- de que alguien se acuerde de escanear -- y en un taller apurado, lo primero
-- que se salta es el paso que no imprime nada.
--
-- `consumption_mode` es la puerta para la otra forma: BACKFLUSH, donde el
-- sistema descuenta solo la cantidad estándar (`ots.calc_sheets`) cuando la OT
-- termina la etapa, sin que nadie escanee. Es la práctica real de un MES/ERP
-- de planta -- confía en el estándar y deja que un conteo físico después
-- encuentre la diferencia, en vez de exigir un escaneo perfecto en el momento
-- de más apuro del taller.
--
-- Por default TODAS las máquinas quedan en 'scan': cero cambio de
-- comportamiento hasta que alguien prenda 'backflush' a propósito para una
-- máquina puntual. 'off' existe para una máquina que no consume papel
-- (troqueladoras, por ejemplo) y no debería ni pedir el escaneo.
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS consumption_mode TEXT NOT NULL DEFAULT 'scan'
    CHECK (consumption_mode IN ('scan', 'backflush', 'off'));

COMMENT ON COLUMN public.machines.consumption_mode IS
  'scan: un operario escanea el lote en /operaciones/escanear (default, sin cambios).
   backflush: el sistema descuenta ots.calc_sheets solo al cerrar la etapa, ver
   src/lib/backflush.ts. off: esta máquina no consume papel, no se pide escaneo.';
