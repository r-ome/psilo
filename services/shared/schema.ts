import {
  pgTable,
  index,
  uuid,
  varchar,
  integer,
  bigint,
  timestamp,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

export const retrievalBatches = pgTable("retrieval_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  batchType: varchar("batch_type", { length: 20 }).notNull(),
  sourceId: varchar("source_id", { length: 255 }),
  retrievalTier: varchar("retrieval_tier", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  totalFiles: integer("total_files").notNull().default(0),
  totalSize: integer("total_size").notNull().default(0),
  requestedAt: timestamp("requested_at").defaultNow(),
  availableAt: timestamp("available_at"),
  expiresAt: timestamp("expires_at"),
}, (t) => ({
  userIdIdx: index("idx_retrieval_batches_user_id").on(t.userId),
  sourceIdIdx: index("idx_retrieval_batches_source_id").on(t.sourceId),
}));

export const users = pgTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  givenName: varchar("given_name", { length: 100 }).notNull(),
  familyName: varchar("family_name", { length: 100 }).notNull(),
  plan: varchar("plan", { length: 20 }).notNull().default("free"),
  storageLimitBytes: bigint("storage_limit_bytes", { mode: "number" }).notNull().default(5368709120),
  createdAt: timestamp("created_at").defaultNow(),
});

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    s3Key: varchar("s3_key", { length: 1000 }).notNull().unique(),
    thumbnailKey: varchar("thumbnail_key", { length: 1000 }),
    previewKey: varchar("preview_key", { length: 1000 }),
    normalizedImportPath: varchar("normalized_import_path", { length: 1000 }),
    filename: varchar("filename", { length: 500 }).notNull(),
    size: integer("size"),
    thumbnailSize: integer("thumbnail_size"),
    width: integer("width"),
    height: integer("height"),
    format: varchar("format", { length: 50 }),
    contentType: varchar("content_type", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    storageClass: varchar("storage_class", { length: 20 }).notNull().default("STANDARD"),
    takenAt: timestamp("taken_at"),
    createdAt: timestamp("created_at").defaultNow(),
    deletedAt: timestamp("deleted_at"),
    phash: varchar("phash", { length: 16 }),
  },
  (table) => ({
    userIdIdx: index("idx_photos_user_id").on(table.userId),
    userNormalizedImportPathIdx: index("idx_photos_user_normalized_import_path").on(
      table.userId,
      table.normalizedImportPath,
    ),
  }),
);

export const albums = pgTable("albums", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const retrievalRequests = pgTable("retrieval_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id").notNull().references(() => retrievalBatches.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  photoId: uuid("photo_id").notNull().references(() => photos.id, { onDelete: "cascade" }),
  s3Key: varchar("s3_key", { length: 1000 }).notNull(),
  fileSize: integer("file_size").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  retrievalLink: text("retrieval_link"),
  requestedAt: timestamp("requested_at").defaultNow(),
  availableAt: timestamp("available_at"),
  expiresAt: timestamp("expires_at"),
}, (t) => ({
  batchIdIdx: index("idx_retrieval_requests_batch_id").on(t.batchId),
  s3KeyIdx: index("idx_retrieval_requests_s3_key").on(t.s3Key),
}));

export const albumPhotos = pgTable(
  "album_photos",
  {
    albumId: uuid("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.albumId, t.photoId] })],
);
