ALTER TABLE "photos"
ADD COLUMN "normalized_import_path" varchar(1000);
--> statement-breakpoint

UPDATE "photos"
SET "normalized_import_path" = regexp_replace(
  regexp_replace("s3_key", '^users/[^/]+/', ''),
  '/google-takeout/[0-9A-Fa-f-]+/',
  '/google-takeout/'
)
WHERE "s3_key" LIKE 'users/%/photos/google-takeout/%'
   OR "s3_key" LIKE 'users/%/videos/google-takeout/%';
--> statement-breakpoint

CREATE INDEX "idx_photos_user_normalized_import_path"
ON "photos" USING btree ("user_id", "normalized_import_path");
