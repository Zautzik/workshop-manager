-- Support partial OT splits
-- is_partial: true when this OT is a fragment of a larger order
-- split_group_id: shared UUID linking all fragments of the same original order

ALTER TABLE ots ADD COLUMN IF NOT EXISTS is_partial boolean NOT NULL DEFAULT false;
ALTER TABLE ots ADD COLUMN IF NOT EXISTS split_group_id uuid;
ALTER TABLE ots ADD COLUMN IF NOT EXISTS split_label text; -- e.g. 'A', 'B', 'C'

-- Index for fetching all fragments of a split
CREATE INDEX IF NOT EXISTS idx_ots_split_group ON ots(split_group_id) WHERE split_group_id IS NOT NULL;
