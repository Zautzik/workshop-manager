-- Align the ots.status column default with the workflow start (Track 2 — LOW-1)
--
-- The column defaulted to 'paper_purchase' (the 3rd workflow state), inherited
-- from an earlier enum definition. The application's state machine starts at
-- 'pre_press' (then 'visto_bueno' for approval), and the create route already
-- sets status = 'pre_press'. Any insert path that omits status would otherwise
-- silently skip pre-press and the approval gate. This makes the DB agree with
-- the workflow.

ALTER TABLE public.ots ALTER COLUMN status SET DEFAULT 'pre_press';
