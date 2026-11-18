import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { State } from "./model.ts";
import type { Binding } from "./store.ts";
import type { Comments } from "./comments.ts";
import type { Learning } from "./learning.ts";
import type { ProjectRegistration } from "./observations.ts";

export const flows = sqliteTable("flows", {
  id: text("id").primaryKey(),
  folder: text("folder").notNull(),
  state: text("state", { mode: "json" }).$type<State>().notNull(),
  revision: integer("revision").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  created: text("created").notNull(),
  closed: text("closed"),
}, table => [index("flows_closed").on(table.closed), index("flows_folder").on(table.folder)]);
export const identities = sqliteTable("identities", { id: text("id").primaryKey() });
export const aliases = sqliteTable("aliases", {
  flow: text("flow").notNull(),
  alias: text("alias").notNull(),
  lookup: text("lookup").notNull(),
  position: integer("position").notNull().default(0),
}, table => [primaryKey({ columns: [table.flow, table.alias] }), index("aliases_lookup").on(table.lookup)]);
export const bindings = sqliteTable("bindings", {
  session: text("session").notNull(), agent: text("agent").notNull(), flow: text("flow").notNull(),
  data: text("data", { mode: "json" }).$type<Binding>().notNull(),
}, table => [primaryKey({ columns: [table.session, table.agent] }), index("bindings_flow").on(table.flow)]);
export const migrations = sqliteTable("migration_identities", {
  source: text("source").primaryKey(), flow: text("flow").notNull(), sha256: text("sha256").notNull(),
});
export const readerComments = sqliteTable("reader_comments", {
  flow: text("flow").primaryKey(), data: text("data", { mode: "json" }).$type<Comments>().notNull(),
});
export const learningProgress = sqliteTable("learning_progress", {
  flow: text("flow").primaryKey(), data: text("data", { mode: "json" }).$type<Learning>().notNull(),
});
export const observationContexts = sqliteTable("observation_contexts", {
  flow: text("flow").primaryKey(), data: text("data", { mode: "json" }).$type<ProjectRegistration>().notNull(),
});
