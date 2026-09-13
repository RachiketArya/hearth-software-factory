"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { workspaceHeaders } from "@/lib/client-workspace";
type SharingData = {
  role: string;
  workspaceId: string;
  ownerName: string;
  name: string;
  workspaces: { id: string; name: string; role: string }[];
  members: { id: string; name: string; role: string }[];
  invites: { id: string; label: string; role: string; expires_at: number }[];
};
export default function Sharing({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<SharingData | null>(null),
    [name, setName] = useState(""),
    [label, setLabel] = useState(""),
    [role, setRole] = useState("collaborator"),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/sharing", {
        headers: workspaceHeaders(),
        cache: "no-store",
      });
      const d = (await r.json()) as any;
      if (!r.ok) throw Error(d.error);
      setData(d);
      setName(d.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/sharing", {
        method: "POST",
        headers: { ...workspaceHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as any;
      if (!r.ok) throw Error(d.error);
      if (d.url) setUrl(d.url);
      await load();
      setNotice(
        body.action === "profile"
          ? "Your display name was saved."
          : "Sharing updated.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sharing-dialog">
        <DialogTitle>People & shared workspaces</DialogTitle>
        <DialogDescription>
          Watch the same office and guide the team together.
        </DialogDescription>
        {error && (
          <p role="alert" className="sharing-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {data && (
          <>
            <label className="field-label" htmlFor="workspace-picker">
              Workspace
            </label>
            <select
              id="workspace-picker"
              className="text-input"
              value={data.workspaceId}
              onChange={(e) => {
                window.location.href =
                  "/?workspace=" + encodeURIComponent(e.target.value);
              }}
            >
              {data.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {w.role}
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor="human-name">
              Your name in activity
            </label>
            <div className="share-inline">
              <input
                id="human-name"
                className="text-input"
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                className="secondary"
                disabled={busy || !name.trim()}
                onClick={() => act({ action: "profile", name })}
              >
                Save name
              </button>
            </div>
            <div className="share-section">
              <h3>People with access</h3>
              <div className="share-person">
                <span>{data.ownerName}</span>
                <small>Owner</small>
              </div>
              {data.members.map((m) => (
                <div className="share-person" key={m.id}>
                  <span>
                    {m.name}
                    <small>{m.role}</small>
                  </span>
                  {data.role === "owner" && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => act({ action: "removeMember", id: m.id })}
                    >
                      Remove {m.name}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {data.role === "owner" ? (
              <div className="share-section">
                <h3>Invite a friend</h3>
                <p className="subtle">
                  First grant your friend access through this site’s Share
                  settings. Then send them a workspace invitation below. They
                  sign in and join your office.
                </p>
                <label className="field-label" htmlFor="invite-label">
                  Invitation label
                </label>
                <input
                  id="invite-label"
                  className="text-input"
                  placeholder="e.g. Sam"
                  maxLength={60}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
                <label className="field-label" htmlFor="invite-role">
                  Access
                </label>
                <select
                  id="invite-role"
                  className="text-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="collaborator">
                    Collaborator — view, guide, and pause
                  </option>
                  <option value="viewer">Viewer — view only</option>
                </select>
                <p className="subtle">
                  Only you can start agents, change budgets, launch apps, and
                  invite people. Links expire in 7 days and can be used by one
                  signed-in person.
                </p>
                <button
                  className="primary"
                  disabled={busy || !label.trim()}
                  onClick={() => act({ action: "invite", label, role })}
                >
                  Create invitation link
                </button>
                {url && (
                  <div className="invite-result">
                    <label className="field-label" htmlFor="invite-url">
                      Send this link privately to your friend
                    </label>
                    <input
                      id="invite-url"
                      className="text-input"
                      readOnly
                      value={url}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      className="secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(url);
                          setNotice("Invitation link copied.");
                        } catch {
                          setNotice("Select the link above and copy it.");
                        }
                      }}
                    >
                      Copy link
                    </button>
                  </div>
                )}
                {data.invites.length > 0 && (
                  <>
                    <h3>Pending invitations</h3>
                    {data.invites.map((i) => (
                      <div className="share-person" key={i.id}>
                        <span>
                          {i.label}
                          <small>
                            {i.role} · expires{" "}
                            {new Date(i.expires_at).toLocaleDateString()}
                          </small>
                        </span>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => {
                            setUrl("");
                            void act({ action: "revokeInvite", id: i.id });
                          }}
                        >
                          Revoke {i.label}
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <p className="connection-notice">
                {data.role === "collaborator"
                  ? "You can send guidance to teammates and pause missions. The owner controls execution and budgets."
                  : "You can view the office, files, and activity. Ask the owner for collaborator access to send guidance."}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function JoinInvitation() {
  const [token, setToken] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("invite");
    if (t) {
      setToken(t);
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, []);
  return (
    <Dialog
      open={!!token}
      onOpenChange={(v) => {
        if (!v) setToken("");
      }}
    >
      <DialogContent>
        <DialogTitle>Join a shared office</DialogTitle>
        <DialogDescription>
          The inviter will be able to see your display name. Join to see their
          agents, missions, and files. Collaborators can also send guidance and
          pause work.
        </DialogDescription>
        <label className="field-label" htmlFor="join-name">
          Your display name
        </label>
        <input
          id="join-name"
          className="text-input"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="What should the team call you?"
        />
        {error && <p role="alert">{error}</p>}
        <button
          className="primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await fetch("/api/sharing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "join", token, name }),
              });
              const d = (await r.json()) as any;
              if (!r.ok) throw Error(d.error);
              window.location.href =
                "/?workspace=" + encodeURIComponent(d.workspaceId);
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy ? "Joining…" : "Join workspace"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
