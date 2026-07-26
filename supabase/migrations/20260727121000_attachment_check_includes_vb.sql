-- El CHECK original exigía ot_id o draft_id; una imagen anclada sólo a un VB
-- lo violaba, así que el tercer ancla (20260727120000) quedaba inutilizable.
-- Encontrado en vivo: el insert con vb_id devolvía 500 en el primer intento.

ALTER TABLE public.ot_attachments
  DROP CONSTRAINT IF EXISTS attachment_belongs_to_ot_or_draft;

ALTER TABLE public.ot_attachments
  ADD CONSTRAINT attachment_belongs_to_ot_draft_or_vb
  CHECK (ot_id IS NOT NULL OR draft_id IS NOT NULL OR vb_id IS NOT NULL);
