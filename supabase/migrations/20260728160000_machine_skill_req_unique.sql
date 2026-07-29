-- Una máquina no puede exigir dos veces la misma competencia.
--
-- Sin esta restricción, guardar un requisito dos veces creaba filas duplicadas
-- y la cobertura contaba mal: la misma habilidad pesaba doble en el readiness
-- y una máquina parecía más exigente de lo que es.

-- Limpiar duplicados previos, conservando el más exigente de cada par.
DELETE FROM public.machine_skill_requirements a
 USING public.machine_skill_requirements b
 WHERE a.machine_id = b.machine_id
   AND a.skill_id  = b.skill_id
   AND (a.min_proficiency, a.created_at) < (b.min_proficiency, b.created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_machine_skill_requirement
  ON public.machine_skill_requirements (machine_id, skill_id);
