import { env } from "cloudflare:workers";
import { initialWorkspace, Workspace } from "./domain";
export function database() {
  if (!env.DB)
    throw new Error(
      "Workspace storage is unavailable. Please try again shortly.",
    );
  return env.DB;
}
export function owner(request: Request) {
  const id = request.headers.get("oai-authenticated-user-id");
  if (id) return id;
  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return "local-development";
  throw new Error("Sign in to access your workspace.");
}
export async function read(ownerId: string) {
  const db = database();
  let row = await db
    .prepare("SELECT data, revision FROM workspaces WHERE owner = ?")
    .bind(ownerId)
    .first<{ data: string; revision: number }>();
  if (!row) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO workspaces (owner, data, revision) VALUES (?, ?, 0)",
      )
      .bind(ownerId, JSON.stringify(initialWorkspace()))
      .run();
    row = await db
      .prepare("SELECT data, revision FROM workspaces WHERE owner = ?")
      .bind(ownerId)
      .first<{ data: string; revision: number }>();
  }
  if (!row) throw new Error("Could not load workspace.");
  return {
    workspace: JSON.parse(row.data) as Workspace,
    revision: row.revision,
  };
}
export async function mutate(ownerId: string, fn: (ws: Workspace) => void) {
  for (let i = 0; i < 5; i++) {
    const { workspace, revision } = await read(ownerId);
    fn(workspace);
    if (JSON.stringify(workspace).length > 1800000)
      throw new Error(
        "Workspace storage limit reached. Export existing missions before creating more.",
      );
    const r = await database()
      .prepare(
        "UPDATE workspaces SET data = ?, revision = revision + 1 WHERE owner = ? AND revision = ?",
      )
      .bind(JSON.stringify(workspace), ownerId, revision)
      .run();
    if (r.meta.changes === 1) return { workspace, revision: revision + 1 };
  }
  throw new Error("The workspace changed. Please try again.");
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new Error("Cross-origin writes are not allowed.");
}
