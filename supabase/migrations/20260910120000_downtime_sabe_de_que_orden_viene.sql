-- machine_downtime_logs no sabía qué orden abrió la fila: "reason" sólo
-- guardaba un texto con los primeros 8 caracteres del id de la orden, no un
-- vínculo real. Sin eso no hay forma de distinguir una parada por mantención
-- PREVENTIVA (planificada, no es una falla) de una CORRECTIVA (una falla de
-- verdad) — y MTBF/MTTR sólo tienen sentido contados sobre fallas. Mezclar
-- las dos haría parecer que la planta falla más seguido de lo que falla.
--
-- Aditivo y sin riesgo: nullable, sin backfill. Las filas ya cerradas se
-- quedan sin atribuir (siguen contando para disponibilidad general, que sí
-- debe incluir toda parada) y MTBF/MTTR arrancan en cero hasta que la
-- primera orden correctiva se cierre después de este cambio.

ALTER TABLE machine_downtime_logs
  ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES maintenance_work_orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN machine_downtime_logs.work_order_id IS
  'Orden de mantención que abrió esta parada (syncDowntime la setea al crear la fila). Nula en filas anteriores a este cambio. Permite distinguir paradas correctivas (fallas reales) de preventivas para MTBF/MTTR.';
