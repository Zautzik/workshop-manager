-- Add new statuses to ot_status enum
ALTER TYPE ot_status ADD VALUE IF NOT EXISTS 'pre_press' BEFORE 'paper_purchase';
ALTER TYPE ot_status ADD VALUE IF NOT EXISTS 'visto_bueno' AFTER 'pre_press';