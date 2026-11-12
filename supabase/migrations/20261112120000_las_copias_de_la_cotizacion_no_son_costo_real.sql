-- Las copias de la cotización no son costo real (2026-11-12).
--
-- El diálogo de avance del Tablero abría con las líneas de la cotización
-- pre-llenadas como costo REAL, y aceptarlas era un clic (auditoría
-- 2026-11-09). Desde 20261110120000 el diálogo ya no las ofrece y el guard
-- rechaza material, máquina y mano de obra que no vengan del consumo o de la
-- pasada. Pero las terminaciones y los gastos generales copiados quedaron en
-- ot_real_costs, una vez POR CADA ETAPA en que se aceptó la copia: la OT
-- 41240 llegó a tener el mismo «Troquelado» nueve veces y un margen de −234 %.
--
-- Regla del dueño: la cotización vive en su carril y se usa para analizar la
-- brecha; nunca es costo real. Se borran las filas de ot_real_costs que son
-- idénticas (descripción, cantidad y precio) a una línea estimada de la misma
-- OT. El disparador trg_unsync_real_cost_from_ledger saca su espejo del libro.
--
-- Al escribirse: 101 filas en 9 OT, $14,8 M. La única fila que no es copia se
-- queda.

DELETE FROM public.ot_real_costs r
 WHERE EXISTS (
   SELECT 1
     FROM public.ot_cost_lines e
    WHERE e.ot_id = r.ot_id
      AND e.kind = 'estimate'
      AND e.description = r.description
      AND round(e.quantity, 3) = round(r.quantity, 3)
      AND round(e.unit_cost) = round(r.unit_cost)
 );
