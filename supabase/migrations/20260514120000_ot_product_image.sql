-- Add product image URL column to OTs table
ALTER TABLE ots ADD COLUMN IF NOT EXISTS product_image_url text;

-- Create storage bucket for OT product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('ot-images', 'ot-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ot-images public read'
  ) THEN
    CREATE POLICY "ot-images public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'ot-images');
  END IF;
END $$;

-- Allow authenticated users to upload
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ot-images auth write'
  ) THEN
    CREATE POLICY "ot-images auth write"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'ot-images');
  END IF;
END $$;

-- Allow authenticated users to update
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ot-images auth update'
  ) THEN
    CREATE POLICY "ot-images auth update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'ot-images');
  END IF;
END $$;

-- Allow authenticated users to delete
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ot-images auth delete'
  ) THEN
    CREATE POLICY "ot-images auth delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'ot-images');
  END IF;
END $$;
