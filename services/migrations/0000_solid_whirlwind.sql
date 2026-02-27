CREATE TABLE "album_photos" (
	"album_id" uuid NOT NULL,
	"photo_id" uuid NOT NULL,
	"added_at" timestamp DEFAULT now(),
	CONSTRAINT "album_photos_album_id_photo_id_pk" PRIMARY KEY("album_id","photo_id")
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"s3_key" varchar(1000) NOT NULL,
	"filename" varchar(500) NOT NULL,
	"size" integer,
	"width" integer,
	"height" integer,
	"format" varchar(50),
	"content_type" varchar(100),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "photos_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"given_name" varchar(100) NOT NULL,
	"family_name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;