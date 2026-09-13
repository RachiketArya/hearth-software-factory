import { isPlayableArtifact } from "@/lib/domain";
import { headers } from "next/headers";
import { resolveAccess } from "@/lib/access";
import { read } from "@/lib/store";
import { safeDocument } from "@/lib/sandbox";
export const dynamic = "force-dynamic";
export default async function Play({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { id } = await params;
  const h = await headers();
  const user = h.get("oai-authenticated-user-id");
  const host = h.get("host") || "";
  const owner =
    user ||
    (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
      ? "local-development"
      : null);
  if (!owner)
    return (
      <main className="empty-view">
        <h1>Sign in to play</h1>
        <a href="/signin-with-chatgpt?return_to=/">Sign in</a>
      </main>
    );
  let workspaceId: string;
  try {
    workspaceId = (
      await resolveAccess(owner, (await searchParams).workspace || owner)
    ).workspaceId;
  } catch {
    return (
      <main className="empty-view">
        <h1>This workspace is private.</h1>
        <a href="/">Back to your office</a>
      </main>
    );
  }
  const officeUrl = "/?workspace=" + encodeURIComponent(workspaceId);
  const { workspace } = await read(workspaceId);
  const m = workspace.missions.find(
    (m) => m.id === id && m.status === "complete",
  );
  const a = m?.artifacts.filter(isPlayableArtifact).at(-1);
  if (!a)
    return (
      <main className="empty-view">
        <h1>This app hasn’t launched yet.</h1>
        <a href="/">Back to the office</a>
      </main>
    );
  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "12px 20px",
          display: "flex",
          justifyContent: "space-between",
          background: "#f5f7f0",
        }}
      >
        <a href={officeUrl}>← Back to Hearth</a>
        <span>
          {m?.title} ·{" "}
          {m?.mode === "demo" ? "Demo artifact" : "Team deliverable"}
        </span>
      </div>
      <iframe
        title={m?.title}
        srcDoc={safeDocument(a.content)}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        style={{ flex: 1, width: "100%", border: 0 }}
      />
    </main>
  );
}
