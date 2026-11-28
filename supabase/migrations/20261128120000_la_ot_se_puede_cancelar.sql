-- Una OT se puede cancelar (2026-11-16).
--
-- El flujo terminaba en `completed` y no había otra salida: un trabajo que el
-- cliente cancelaba se quedaba para siempre en su columna del Tablero, con el
-- papel que ya había salido de bodega cargado a su costo, o alguien lo
-- retrocedía hasta Pre-Prensa para sacarlo de la vista.
--
-- Cancelar NO es un estado más del flujo. `ot_status` lo leen las compuertas,
-- la matriz de permisos por rol, los tableros y los reportes; sumarle un valor
-- obliga a que cada uno aprenda qué hacer con él. Es una marca sobre la OT: la
-- fila conserva el estado en el que estaba —que es lo que cuenta hasta dónde
-- llegó el trabajo— y deja de aparecer entre las activas.
--
-- El motivo es obligatorio, como al anular una OC o liberar una reserva: una
-- OT que desaparece sin explicación es indistinguible de un error.
--
-- El papel que vuelve a bodega lo declara quien cancela, lote por lote
-- (src/lib/ot-cancel.ts): lo que ya se cortó o se imprimió no vuelve y queda
-- como costo real de la OT.

ALTER TABLE public.ots ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ;
ALTER TABLE public.ots ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE public.ots ADD COLUMN IF NOT EXISTS cancelled_by  UUID;

ALTER TABLE public.ots DROP CONSTRAINT IF EXISTS ots_cancelada_con_motivo;
ALTER TABLE public.ots ADD CONSTRAINT ots_cancelada_con_motivo CHECK (
  cancelled_at IS NULL OR length(btrim(COALESCE(cancel_reason, ''))) >= 5
);

CREATE INDEX IF NOT EXISTS idx_ots_cancelled_at ON public.ots (cancelled_at) WHERE cancelled_at IS NOT NULL;

COMMENT ON COLUMN public.ots.cancelled_at IS
  'Cuándo se canceló la OT. NULL = vigente. La OT conserva su `status`: dice hasta dónde llegó el trabajo.';
COMMENT ON COLUMN public.ots.cancel_reason IS 'Por qué se canceló. Obligatorio al cancelar.';
COMMENT ON COLUMN public.ots.cancelled_by IS 'Quién la canceló (auth.users.id).';
