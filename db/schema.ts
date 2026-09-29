import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const workspaces=sqliteTable('workspaces',{
 ownerId:text('owner_id').primaryKey(),
 revision:text('revision').notNull(),
 data:text('data').notNull(),
 updatedAt:text('updated_at').notNull(),
});
