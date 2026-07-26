-- La imagen ES el trabajo.
--
-- Un Visto Bueno firmado sin la imagen aprobada es una firma sobre el aire:
-- cuando el cliente reclama "me imprimieron el pantone equivocado", lo único
-- que zanja la discusión es el visual que él mismo aprobó. Y una OT sin arte
-- es cómo se imprimen 150.000 etiquetas de memoria.
--
-- ot_attachments ya ancla archivos a una OT (ot_id) o a un borrador (draft_id),
-- pero nada podía anclarse a un VB. La imagen del VB es evidencia contractual:
-- merece llave foránea de verdad, no un draft_id reciclado.

ALTER TABLE public.ot_attachments
  ADD COLUMN IF NOT EXISTS vb_id UUID REFERENCES public.vistos_buenos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ot_attachments_vb_id
  ON public.ot_attachments (vb_id)
  WHERE vb_id IS NOT NULL;

COMMENT ON COLUMN public.ot_attachments.vb_id IS
  'Evidencia visual de un Visto Bueno: lo que el cliente está aprobando al firmar. El servidor rechaza firmar un VB que no tenga al menos una imagen anclada aquí (auditoría 2026-07).';

-- Una OT puede nacer declaradamente sin arte (llamada telefónica, arte en
-- camino) — pero tiene que decirlo, y se le nota hasta que alguien lo suba.
-- Mismo patrón que la ficha incompleta: el sistema rechaza lo silenciosamente
-- incorrecto y permite lo explícitamente incompleto.
ALTER TABLE public.ots
  ADD COLUMN IF NOT EXISTS sin_arte BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ots.sin_arte IS
  'true = la OT se creó declarando que aún no hay arte/imagen. Visible en la UI hasta que se adjunte; la creación sin imagen y sin esta bandera se rechaza.';
