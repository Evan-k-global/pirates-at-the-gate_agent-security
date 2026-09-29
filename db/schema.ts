import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const runs=sqliteTable('witness_runs',{id:text('id').primaryKey(),tokenHash:text('token_hash').notNull(),state:text('state').notNull(),revision:integer('revision').notNull().default(0),createdAt:integer('created_at').notNull()});
export const quotas=sqliteTable('witness_quotas',{bucket:text('bucket').primaryKey(),count:integer('count').notNull()});
