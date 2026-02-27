import { pgTable, uuid, varchar, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  givenName: varchar('given_name', { length: 100 }).notNull(),
  familyName: varchar('family_name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const photos = pgTable('photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  s3Key: varchar('s3_key', { length: 1000 }).notNull().unique(),
  filename: varchar('filename', { length: 500 }).notNull(),
  size: integer('size'),
  width: integer('width'),
  height: integer('height'),
  format: varchar('format', { length: 50 }),
  contentType: varchar('content_type', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const albums = pgTable('albums', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const albumPhotos = pgTable('album_photos', {
  albumId: uuid('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
  photoId: uuid('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  addedAt: timestamp('added_at').defaultNow(),
}, (t) => [primaryKey({ columns: [t.albumId, t.photoId] })]);
