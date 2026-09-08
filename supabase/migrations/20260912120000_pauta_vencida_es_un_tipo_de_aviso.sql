-- notification_type no tenía ningún valor para "una pauta de mantención
-- venció" -- el aviso in-app más cercano era 'system_alert', genérico a
-- propósito para otra cosa. Aditivo puro: ALTER TYPE ... ADD VALUE no toca
-- las filas existentes ni exige recrear el enum.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'maintenance_schedule_due';
