import { z } from "zod";
import { database, owner, checkOrigin, read } from "@/lib/store";
import { access, requireOwner, displayName } from "@/lib/access";
export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("profile"),
    name: z.string().trim().min(1).max(40),
  }),
  z.object({
    action: z.literal("invite"),
    label: z.string().trim().min(1).max(60),
    role: z.enum(["viewer", "collaborator"]),
  }),
  z.object({
    action: z.literal("join"),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().trim().min(1).max(40),
  }),
  z.object({ action: z.literal("revokeInvite"), id: z.string().max(100) }),
  z.object({ action: z.literal("removeMember"), id: z.string().max(200) }),
]);
async function hash(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function GET(req: Request) {
  try {
    const a = await access(req),
      db = database();
    const workspaces = await db
      .prepare(
        `SELECT m.workspace AS id,m.role,COALESCE(p.name,'Shared') || '’s workspace' AS name FROM hearth_members m LEFT JOIN hearth_profiles p ON p.user_id=m.workspace WHERE m.user_id=?`,
      )
      .bind(a.userId)
      .all();
    const members = await db
      .prepare(
        `SELECT m.user_id AS id,m.role,COALESCE(p.name,'Collaborator') AS name FROM hearth_members m LEFT JOIN hearth_profiles p ON p.user_id=m.user_id WHERE m.workspace=?`,
      )
      .bind(a.workspaceId)
      .all();
    const invites =
      a.role === "owner"
        ? (
            await db
              .prepare(
                "SELECT id,label,role,expires_at FROM hearth_invites WHERE workspace=? AND claimed_by IS NULL AND revoked=0 AND expires_at>?",
              )
              .bind(a.workspaceId, Date.now())
              .all()
          ).results
        : [];
    return Response.json(
      {
        ...a,
        name: await displayName(a.userId),
        ownerName: await displayName(a.workspaceId),
        workspaces: [
          { id: a.userId, name: "My workspace", role: "owner" },
          ...workspaces.results,
        ],
        members: members.results,
        invites,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const userId = owner(req),
      data = schema.parse(await req.json()),
      db = database();
    if (data.action === "profile") {
      await db
        .prepare(
          "INSERT INTO hearth_profiles (user_id,name) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name",
        )
        .bind(userId, data.name)
        .run();
      return Response.json({ ok: true });
    }
    if (data.action === "join") {
      const tokenHash = await hash(data.token);
      const invite = await db
        .prepare(
          "SELECT * FROM hearth_invites WHERE token_hash=? AND revoked=0 AND expires_at>?",
        )
        .bind(tokenHash, Date.now())
        .first<{ workspace: string; claimed_by: string | null }>();
      if (!invite || (invite.claimed_by && invite.claimed_by !== userId))
        throw new Error(
          "This invitation has expired, been revoked, or already been used. Ask for a new link.",
        );
      if (invite.workspace === userId)
        throw new Error("This is your own invitation. Send it to your friend.");
      await db.batch([
        db
          .prepare(
            "UPDATE hearth_invites SET claimed_by=? WHERE token_hash=? AND claimed_by IS NULL AND revoked=0 AND expires_at>?",
          )
          .bind(userId, tokenHash, Date.now()),
        db
          .prepare(
            `INSERT OR IGNORE INTO hearth_members (workspace,user_id,role,joined_at) SELECT workspace,claimed_by,role,? FROM hearth_invites WHERE token_hash=? AND claimed_by=? AND revoked=0 AND expires_at>?`,
          )
          .bind(Date.now(), tokenHash, userId, Date.now()),
        db
          .prepare(
            "INSERT INTO hearth_profiles (user_id,name) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name",
          )
          .bind(userId, data.name),
      ]);
      const member = await db
        .prepare(
          "SELECT user_id FROM hearth_members WHERE workspace=? AND user_id=?",
        )
        .bind(invite.workspace, userId)
        .first();
      if (!member)
        throw new Error(
          "This invitation was used or revoked. Ask for a new link.",
        );
      return Response.json({ workspaceId: invite.workspace });
    }
    const a = await access(req);
    requireOwner(a);
    if (data.action === "invite") {
      await read(a.workspaceId);
      const count = await db
        .prepare(
          "SELECT COUNT(*) AS n FROM hearth_invites WHERE workspace=? AND revoked=0 AND claimed_by IS NULL AND expires_at>?",
        )
        .bind(a.workspaceId, Date.now())
        .first<{ n: number }>();
      if ((count?.n || 0) >= 20)
        throw new Error("Revoke an unused invitation before creating another.");
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      const expires = Date.now() + 7 * 86400000;
      await db
        .prepare(
          "INSERT INTO hearth_invites (id,workspace,token_hash,label,role,expires_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          a.workspaceId,
          await hash(token),
          data.label,
          data.role,
          expires,
        )
        .run();
      return Response.json({
        url: new URL(req.url).origin + "/#invite=" + token,
        expiresAt: expires,
      });
    }
    if (data.action === "revokeInvite")
      await db
        .prepare(
          "UPDATE hearth_invites SET revoked=1 WHERE id=? AND workspace=?",
        )
        .bind(data.id, a.workspaceId)
        .run();
    if (data.action === "removeMember") {
      if (data.id === a.workspaceId)
        throw new Error("The workspace owner cannot be removed.");
      await db.batch([
        db
          .prepare(
            "UPDATE hearth_invites SET revoked=1 WHERE workspace=? AND claimed_by=?",
          )
          .bind(a.workspaceId, data.id),
        db
          .prepare("DELETE FROM hearth_members WHERE workspace=? AND user_id=?")
          .bind(a.workspaceId, data.id),
        db
          .prepare(
            "DELETE FROM hearth_presence WHERE workspace=? AND user_id=?",
          )
          .bind(a.workspaceId, data.id),
      ]);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? "Check the name, role, and invitation."
            : (e as Error).message,
      },
      { status: 400 },
    );
  }
}
