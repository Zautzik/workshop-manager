-- Reemplazar ot_role_transitions en una sola transacción.
--
-- El endpoint de administración (PUT /api/admin/role-transitions) borra todo
-- e inserta lo nuevo -- es la operación honesta para una tabla que se lee
-- como todo-o-nada. Hecho como dos llamadas HTTP separadas (delete, insert)
-- corre el riesgo de que la segunda falle y la tabla quede vacía sin que
-- nadie lo haya pedido -- un failure mode seguro (loadRoleAccess() cae al
-- default hardcodeado) pero confuso. Esta función hace las dos cosas en la
-- misma transacción.
CREATE OR REPLACE FUNCTION public.replace_role_transitions(p_rows JSONB)
RETURNS SETOF public.ot_role_transitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ot_role_transitions;

  INSERT INTO public.ot_role_transitions (role, to_status)
  SELECT DISTINCT r->>'role', r->>'to_status'
  FROM jsonb_array_elements(p_rows) AS r;

  RETURN QUERY SELECT * FROM public.ot_role_transitions;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_role_transitions(JSONB) TO authenticated;
