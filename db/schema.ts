import {
  integer,
  sqliteTable,
  text,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
export const workspaces = sqliteTable("workspaces", {
  owner: text("owner").primaryKey(),
  data: text("data").notNull(),
  revision: integer("revision").notNull().default(0),
});

export const profiles = sqliteTable("hearth_profiles", {
  userId: text("user_id").primaryKey(),
  name: text("name").notNull(),
});
export const members = sqliteTable(
  "hearth_members",
  {
    workspace: text("workspace").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["viewer", "collaborator"] }).notNull(),
    joinedAt: integer("joined_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspace, t.userId] }),
    index("hearth_members_user").on(t.userId),
  ],
);
export const invites = sqliteTable("hearth_invites", {
  id: text("id").primaryKey(),
  workspace: text("workspace").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label").notNull(),
  role: text("role", { enum: ["viewer", "collaborator"] }).notNull(),
  expiresAt: integer("expires_at").notNull(),
  claimedBy: text("claimed_by"),
  revoked: integer("revoked").notNull().default(0),
});
export const presence = sqliteTable(
  "hearth_presence",
  {
    workspace: text("workspace").notNull(),
    userId: text("user_id").notNull(),
    seenAt: integer("seen_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspace, t.userId] })],
);
