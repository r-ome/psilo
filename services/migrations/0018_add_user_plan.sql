ALTER TABLE "users" ADD COLUMN "plan" varchar(20) DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "storage_limit_bytes" bigint DEFAULT 5368709120 NOT NULL;