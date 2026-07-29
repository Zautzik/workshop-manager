-- Las máquinas de terminación existen en el taller pero no en el enum.
--
-- Dobladora, alzadora, corchetera, hotmelera y polilaminadora caían todas en
-- 'manual_workshop', que es donde va lo que el modelo no supo nombrar. Con eso
-- perdido, ninguna de ellas podía tener sistemas propios, ni pauta, ni
-- repuestos, ni competencias declaradas: quedaban fuera de todo lo que este
-- módulo hace.
--
-- NOTA DE POSTGRES: ALTER TYPE ... ADD VALUE no puede usarse en la misma
-- transacción que lo agrega. Por eso esta migración SÓLO agrega los valores y
-- los sistemas de cada una viajan en la siguiente.

ALTER TYPE public.machine_type ADD VALUE IF NOT EXISTS 'folder';          -- dobladora
ALTER TYPE public.machine_type ADD VALUE IF NOT EXISTS 'collator';        -- alzadora
ALTER TYPE public.machine_type ADD VALUE IF NOT EXISTS 'stitcher';        -- corchetera
ALTER TYPE public.machine_type ADD VALUE IF NOT EXISTS 'perfect_binder';  -- hotmelera
ALTER TYPE public.machine_type ADD VALUE IF NOT EXISTS 'laminator';       -- polilaminadora
