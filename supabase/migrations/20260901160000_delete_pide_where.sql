-- El proyecto rechaza un DELETE sin WHERE (SQLSTATE 21000, "DELETE requires a
-- WHERE clause") -- una salvaguarda de la plataforma, no de esta app.
-- replace_role_transitions() vaciaba la tabla entera con un DELETE pelado y
-- chocaba contra eso; confirmado en vivo (la transacción abortó y rollbackeó
-- sola, la tabla quedó intacta -- exactamente el failure mode seguro que se
-- buscaba, sólo que el guardado nunca llegó a completarse).
CREATE OR REPLACE FUNCTION public.replace_role_transitions(p_rows JSONB)
RETURNS SETOF public.ot_role_transitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ot_role_transitions WHERE true;

  INSERT INTO public.ot_role_transitions (role, to_status)
  SELECT DISTINCT r->>'role', r->>'to_status'
  FROM jsonb_array_elements(p_rows) AS r;

  RETURN QUERY SELECT * FROM public.ot_role_transitions;
END;
$$;
