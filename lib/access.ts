import { database, owner } from "./store";
export type AccessRole = "owner" | "collaborator" | "viewer";
export class AccessError extends Error {
  status = 403;
}
export async function resolveAccess(userId: string, workspaceId = userId) {
  if (workspaceId.length > 200) throw new AccessError("Invalid workspace.");
  if (userId === workspaceId)
    return { userId, workspaceId, role: "owner" as AccessRole };
  const member = await database()
    .prepare(
      "SELECT role FROM hearth_members WHERE workspace = ? AND user_id = ?",
    )
    .bind(workspaceId, userId)
    .first<{ role: AccessRole }>();
  if (!member)
    throw new AccessError(
      "You do not have access to this workspace. Ask its owner for an invitation.",
    );
  return { userId, workspaceId, role: member.role };
}
export async function access(req: Request) {
  const userId = owner(req);
  return resolveAccess(
    userId,
    req.headers.get("x-hearth-workspace") ||
      new URL(req.url).searchParams.get("workspace") ||
      userId,
  );
}
export function requireOwner(a: { role: AccessRole }) {
  if (a.role !== "owner")
    throw new AccessError(
      "Only the workspace owner can manage agents, spend tokens, or change access.",
    );
}
export async function displayName(userId: string) {
  const row = await database()
    .prepare("SELECT name FROM hearth_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ name: string }>();
  return row?.name || "Workspace owner";
}
export async function accessInfo(a: Awaited<ReturnType<typeof access>>) {
  const name = await displayName(a.userId);
  await database()
    .prepare(
      "INSERT INTO hearth_presence (workspace,user_id,seen_at) VALUES (?,?,?) ON CONFLICT(workspace,user_id) DO UPDATE SET seen_at=excluded.seen_at",
    )
    .bind(a.workspaceId, a.userId, Date.now())
    .run();
  const people = await database()
    .prepare(
      `SELECT p.user_id, COALESCE(n.name, 'Workspace owner') AS name, p.seen_at FROM hearth_presence p LEFT JOIN hearth_profiles n ON n.user_id=p.user_id WHERE p.workspace=? AND p.seen_at > ? AND (p.user_id=? OR EXISTS (SELECT 1 FROM hearth_members m WHERE m.workspace=p.workspace AND m.user_id=p.user_id))`,
    )
    .bind(a.workspaceId, Date.now() - 20000, a.workspaceId)
    .all();
  return { ...a, name, people: people.results };
}
