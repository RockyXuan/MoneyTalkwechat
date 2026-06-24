import { pgTable, serial, varchar, numeric, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  openid: varchar("openid", { length: 128 }).unique(),
  nickname: varchar("nickname", { length: 64 }),
  avatar_url: varchar("avatar_url", { length: 512 }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("users_openid_idx").on(table.openid),
]);

export const expenses = pgTable("expenses", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id", { length: 36 }).notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  category: varchar("category", { length: 32 }).notNull().default("其他"),
  tag: varchar("tag", { length: 32 }),
  note: text("note"),
  source_type: varchar("source_type", { length: 16 }).notNull().default("text"),
  raw_text: text("raw_text"),
  expense_date: varchar("expense_date", { length: 10 }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("expenses_user_id_idx").on(table.user_id),
  index("expenses_expense_date_idx").on(table.expense_date),
  index("expenses_category_idx").on(table.category),
  index("expenses_user_date_idx").on(table.user_id, table.expense_date),
]);

export const userPreferences = pgTable("user_preferences", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id", { length: 36 }).notNull(),
  preference_type: varchar("preference_type", { length: 32 }).notNull().default("category_mapping"),
  key_word: varchar("key_word", { length: 64 }).notNull(),
  mapped_value: varchar("mapped_value", { length: 64 }).notNull(),
  source: varchar("source", { length: 32 }).notNull().default("user_correction"),
  confidence: integer("confidence").notNull().default(100),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("user_preferences_user_id_idx").on(table.user_id),
  index("user_preferences_key_word_idx").on(table.key_word),
]);

export const categories = pgTable("categories", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id", { length: 36 }),
  name: varchar("name", { length: 32 }).notNull(),
  icon: varchar("icon", { length: 32 }),
  is_default: boolean("is_default").notNull().default(false),
  sort_order: integer("sort_order").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("categories_user_id_idx").on(table.user_id),
]);
