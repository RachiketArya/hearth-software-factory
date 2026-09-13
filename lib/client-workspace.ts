export function workspaceHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const id = new URLSearchParams(window.location.search).get("workspace");
  return id ? { "x-hearth-workspace": id } : {};
}
export type WorkspaceAccess = {
  userId: string;
  workspaceId: string;
  role: "owner" | "collaborator" | "viewer";
  name: string;
  people: { user_id: string; name: string; seen_at: number }[];
};
