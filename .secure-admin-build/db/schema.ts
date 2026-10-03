import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const siteSnapshots = sqliteTable("site_snapshots", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});
