"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus,
  ArrowUpRight,
  Play,
  Pause,
  Users,
  Box,
  Settings2,
  ChevronDown,
  ArrowUp,
  Activity,
  Check,
  MessageCircle,
  Minus,
  Maximize2,
  Flag,
  Home,
  LayoutGrid,
  FileText,
  Radio,
  Download,
  ExternalLink,
  RefreshCw,
  ArrowLeftRight,
  KeyRound,
  AlertCircle,
  Send,
  Loader2,
} from "lucide-react";
import Office, { Avatar } from "@/components/hearth/office";
import {
  Agent,
  Workspace,
  Artifact,
  Mission,
  pinballPrompt,
  roles,
} from "@/lib/domain";
import { safeDocument } from "@/lib/sandbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
const seed: Workspace = {
  teams: [
    {
      id: "engineering",
      name: "Engineering",
      template: "engineering",
      description: "A complete product engineering team",
    },
  ],
  agents: roles.map((r) => ({ ...r, id: r.role, teamId: "engineering" })),
  missions: [],
};
type Snapshot = {
  workspace: Workspace;
  revision: number;
  connected?: boolean;
  model?: string;
};
const templates = [
  {
    id: "engineering",
    name: "Engineering studio",
    description: "Plan, design, build, review, and launch.",
    roles: ["pm", "designer", "backend", "frontend", "qa", "manager"],
    icon: "⌘",
  },
  {
    id: "lean",
    name: "Lean builders",
    description: "A focused trio for small apps and experiments.",
    roles: ["pm", "frontend", "qa"],
    icon: "↗",
  },
  {
    id: "design",
    name: "Product & design",
    description: "Bring an idea to life with design-led delivery.",
    roles: ["pm", "designer", "frontend", "qa"],
    icon: "◈",
  },
];
function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function time(at: string) {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
export default function Page() {
  const [ws, setWs] = useState<Workspace>(seed),
    [loaded, setLoaded] = useState(false),
    [teamId, setTeamId] = useState(""),
    [missionId, setMissionId] = useState(""),
    [agent, setAgent] = useState<Agent | null>(null),
    [modal, setModal] = useState<
      "mission" | "team" | "settings" | "collaborate" | null
    >(null),
    [view, setView] = useState("office"),
    [prompt, setPrompt] = useState(pinballPrompt),
    [zoom, setZoom] = useState(1),
    [mode, setMode] = useState<"demo" | "live">("demo"),
    [model, setModel] = useState("gpt-5.2"),
    [apiKey, setApiKey] = useState(""),
    [serverConnected, setServerConnected] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [running, setRunning] = useState(false),
    [message, setMessage] = useState(""),
    [teamName, setTeamName] = useState(""),
    [artifact, setArtifact] = useState<Artifact | null>(null),
    [artifactView, setArtifactView] = useState("preview"),
    [agentName, setAgentName] = useState(""),
    [instructions, setInstructions] = useState(""),
    [collabTeam, setCollabTeam] = useState(""),
    [collabBrief, setCollabBrief] = useState(""),
    [budget, setBudget] = useState("60000"),
    [feedFilter, setFeedFilter] = useState("all");
  const wsRef = useRef(ws),
    revision = useRef(-1),
    flight = useRef(false);
  wsRef.current = ws;
  const accept = useCallback((s: Snapshot) => {
    if (s.revision >= revision.current) {
      revision.current = s.revision;
      setWs(s.workspace);
    }
    setLoaded(true);
    if (s.connected !== undefined) setServerConnected(s.connected);
  }, []);
  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/workspace", { cache: "no-store" });
      const s = (await r.json()) as Snapshot & { error?: string };
      if (!r.ok) throw new Error(s.error || "Could not load workspace.");
      accept(s);
      return s;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [accept]);
  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 4500);
    return () => clearInterval(t);
  }, [reload]);
  const mutate = useCallback(
    async (action: Record<string, unknown>) => {
      setBusy(true);
      setError("");
      try {
        const r = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        });
        const s = (await r.json()) as Snapshot & { error?: string };
        if (!r.ok) throw new Error(s.error || "Could not save the change.");
        accept(s);
        return s as Snapshot;
      } catch (e) {
        setError((e as Error).message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [accept],
  );
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (flight.current) return;
      const m = wsRef.current.missions.find(
        (m) =>
          m.status === "running" &&
          (!m.leaseUntil || m.leaseUntil < Date.now()),
      );
      if (!m) return;
      if (m.mode === "live" && !apiKey && !serverConnected) return;
      flight.current = true;
      setRunning(true);
      try {
        const r = await fetch("/api/step", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "x-model-key": apiKey } : {}),
          },
          body: JSON.stringify({ id: m.id, model }),
        });
        const s = (await r.json()) as Snapshot & { error?: string };
        if (!r.ok) {
          if (
            !s.error?.includes("already working") &&
            !s.error?.includes("not running")
          )
            throw new Error(s.error || "The teammate could not finish.");
        } else if (alive) accept(s);
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          void reload();
        }
      } finally {
        flight.current = false;
        if (alive) setRunning(false);
      }
    };
    const t = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [apiKey, serverConnected, model, accept, reload]);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: "read_office",
        title: "Read office",
        description:
          "Read team and mission summaries in the current workspace.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => ({
          teams: wsRef.current.teams,
          missions: wsRef.current.missions.map((m) => ({
            id: m.id,
            title: m.title,
            status: m.status,
            mode: m.mode,
          })),
        }),
      },
      {
        name: "create_mission",
        title: "Create mission",
        description:
          "Create a saved mission for a team without starting execution.",
        inputSchema: {
          type: "object",
          properties: {
            teamId: { type: "string" },
            prompt: { type: "string" },
            mode: { type: "string", enum: ["demo", "live"] },
          },
          required: ["teamId", "prompt", "mode"],
          additionalProperties: false,
        },
        execute: async (input: any) => {
          if (
            !input ||
            typeof input.teamId !== "string" ||
            typeof input.prompt !== "string" ||
            !["demo", "live"].includes(input.mode)
          )
            throw new Error("A team, prompt and valid mode are required.");
          const r = await mutate({
            action: "mission",
            teamId: input.teamId,
            prompt: input.prompt,
            mode: input.mode,
          });
          if (!r) throw new Error("Mission creation failed.");
          const m = r.workspace.missions[0];
          setTeamId(m.teamId);
          setMissionId(m.id);
          return { id: m.id, status: m.status };
        },
      },
    ];
    for (const t of tools)
      Promise.resolve(
        context.registerTool(t, { signal: lifecycle.signal }),
      ).catch(() => {});
    return () => lifecycle.abort();
  }, [mutate]);
  const team = ws.teams.find((t) => t.id === teamId) || ws.teams[0];
  const agents = ws.agents.filter((a) => a.teamId === team.id);
  const missions = ws.missions.filter((m) => m.teamId === team.id);
  const mission = missions.find((m) => m.id === missionId) || missions[0];
  const connected = serverConnected || !!apiKey;
  const done = mission?.tasks.filter((t) => t.status === "done").length || 0;
  const inspect = (a: Agent) => {
    setAgent(a);
    setAgentName(a.name);
    setInstructions(a.instructions);
  };
  const createMission = async () => {
    if (mode === "live" && !connected) {
      setModal("settings");
      return;
    }
    const r = await mutate({
      action: "mission",
      teamId: team.id,
      prompt,
      mode,
      maxTokens: Number(budget),
    });
    if (r) {
      setMissionId(r.workspace.missions[0].id);
      setModal(null);
    }
  };
  const control = async (command: string) => {
    if (!mission) return;
    if (
      ["start", "resume"].includes(command) &&
      mission.mode === "live" &&
      !connected
    ) {
      setModal("settings");
      return;
    }
    await mutate({ action: "control", id: mission.id, command });
  };
  const sendMessage = async () => {
    if (!mission || !message.trim()) return;
    const r = await mutate({
      action: "message",
      id: mission.id,
      text: message,
      ...(agent ? { agentId: agent.id } : {}),
    });
    if (r) setMessage("");
  };
  const events =
    mission?.events.filter(
      (e) =>
        feedFilter === "all" ||
        (feedFilter === "files"
          ? e.kind === "artifact"
          : ["message", "handoff", "review"].includes(e.kind)),
    ) || [];
  return (
    <div className="app-shell">
      <aside className="leftbar">
        <a className="brand" href="/">
          <span className="brandmark">h</span>hearth
          <span className="beta">beta</span>
        </a>
        <button
          className="workspace-switch"
          onClick={() => setModal("settings")}
        >
          <span className="workspace-letter">S</span>
          <span>
            Studio workspace<small>Your little big company</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="sidebar-label">Workspace</div>
        <button
          title="Office"
          className={`nav-item ${view === "office" ? "selected" : ""}`}
          onClick={() => setView("office")}
        >
          <Home size={18} />
          Office
        </button>
        <button
          title="Mission board"
          className={`nav-item ${view === "board" ? "selected" : ""}`}
          onClick={() => setView("board")}
        >
          <LayoutGrid size={18} />
          Mission board
        </button>
        <button
          title="Team templates"
          className="nav-item"
          onClick={() => setModal("team")}
        >
          <Box size={18} />
          Team templates<span className="tiny-count">3</span>
        </button>
        <div className="sidebar-label team-label">
          Your teams
          <button aria-label="Create team" onClick={() => setModal("team")}>
            <Plus size={16} />
          </button>
        </div>
        <div className="team-list">
          {ws.teams.map((t) => (
            <button
              key={t.id}
              className={`team-nav ${t.id === team.id ? "current" : ""}`}
              onClick={() => {
                setTeamId(t.id);
                setMissionId("");
                setView("office");
              }}
            >
              <span className="team-icon">
                {templates.find((v) => v.id === t.template)?.icon || "⌘"}
              </span>
              <span>
                {t.name}
                <small>
                  {ws.agents.filter((a) => a.teamId === t.id).length} teammates
                </small>
              </span>
              <span className="live-dot" />
            </button>
          ))}
        </div>
        <button className="add-team" onClick={() => setModal("team")}>
          <Plus size={16} />
          Spawn a team
        </button>
        <div className="sidebar-bottom">
          <div className="little-note">
            <span>Better together.</span>
            <p>Big ideas start with a small team.</p>
            <div className="mini-avatars">
              {agents.slice(0, 4).map((a) => (
                <Avatar key={a.id} color={a.color} size={29} />
              ))}
            </div>
          </div>
          <button
            title="Workspace settings"
            className="nav-item"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={17} />
            Workspace settings
          </button>
          <div className="user">
            <span>R</span>
            <div>
              Studio workspace<small>Private to you</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <span className="breadcrumb-slash">/</span>
            <Select
              value={team.id}
              onValueChange={(v) => {
                setTeamId(v);
                setMissionId("");
              }}
            >
              <SelectTrigger
                className="breadcrumb-select"
                aria-label="Current team"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ws.teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
          <div>
            <button className="mode-pill" onClick={() => setModal("settings")}>
              <Radio size={13} />
              {mission?.mode === "live" ? "Live agents" : "Demo mode"}
            </button>
            <span className="top-avatar">R</span>
          </div>
        </header>
        <div className="page-heading">
          <div>
            <div className="heading-line">
              <h1>
                {team.name === "Engineering"
                  ? "The engineering office"
                  : team.name + " office"}
              </h1>
              <span className="live-badge">
                <span className="live-dot" />
                {agents.length} teammates
              </span>
            </div>
            <p>
              {mission?.status === "running"
                ? "Your team is turning the brief into real work."
                : "A small team. A shared space. Your next big thing."}
            </p>
          </div>
          <button
            className="primary"
            disabled={!loaded}
            onClick={() => setModal("mission")}
          >
            <Plus size={17} />
            New mission
          </button>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
            <button
              onClick={() => {
                setError("");
                void reload();
              }}
            >
              Retry
            </button>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        <div className="work-area">
          <section className="office-section">
            <div className="office-toolbar">
              <Tabs value={view} onValueChange={setView}>
                <TabsList variant="line">
                  <TabsTrigger value="office">
                    <Home />
                    Office
                  </TabsTrigger>
                  <TabsTrigger value="board">
                    <LayoutGrid />
                    Board
                  </TabsTrigger>
                  <TabsTrigger value="artifacts">
                    <Box />
                    Deliverables
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="toolbar-end">
                <span className="live-dot" />
                {mission?.status === "running"
                  ? "Work in progress"
                  : "All systems calm"}
              </span>
            </div>
            {view === "office" ? (
              <Office
                agents={agents}
                mission={mission?.mode === "live" && !connected ? {...mission, status: "paused"} : mission}
                onAgent={inspect}
                zoom={zoom}
              />
            ) : view === "board" ? (
              <div className="board-surface">
                {!mission ? (
                  <div className="empty-view">
                    <Flag size={32} />
                    <h2>A fresh board for your next idea</h2>
                    <p>Give your team a mission to start building.</p>
                    <button
                      className="primary"
                      onClick={() => setModal("mission")}
                    >
                      Create a mission
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="board-title">
                      <div>
                        <span className="subtle">
                          {mission.mode === "demo"
                            ? "Scripted walkthrough"
                            : "Live mission"}
                        </span>
                        <h2>{mission.title}</h2>
                      </div>
                      <button
                        className="icon-btn"
                        aria-label="Export mission"
                        onClick={() =>
                          download(
                            "mission.json",
                            JSON.stringify(mission, null, 2),
                            "application/json",
                          )
                        }
                      >
                        <Download size={17} />
                      </button>
                    </div>
                    <div className="kanban">
                      {[
                        { label: "Up next", states: ["queued"] },
                        {
                          label: "In progress",
                          states: ["working", "blocked"],
                        },
                        { label: "Completed", states: ["done"] },
                      ].map((col) => (
                        <div className="kanban-column" key={col.label}>
                          <h3>
                            {col.label}
                            <span>
                              {
                                mission.tasks.filter((t) =>
                                  col.states.includes(t.status),
                                ).length
                              }
                            </span>
                          </h3>
                          {mission.tasks
                            .filter((t) => col.states.includes(t.status))
                            .map((t) => {
                              const a = agents.find((a) => a.role === t.role);
                              return (
                                <button
                                  className={`task-card ${t.status}`}
                                  key={t.id}
                                  onClick={() => a && inspect(a)}
                                >
                                  {t.status === "done" ? (
                                    <Check size={15} />
                                  ) : t.status === "working" ? (
                                    <Loader2 size={15} className="spin" />
                                  ) : (
                                    <Flag size={14} />
                                  )}
                                  <h4>{t.title}</h4>
                                  {t.summary && <p>{t.summary}</p>}
                                  <span>
                                    <Avatar
                                      color={a?.color || "#888"}
                                      size={25}
                                    />
                                    {a?.name}
                                    <small>{a?.title}</small>
                                  </span>
                                </button>
                              );
                            })}
                          {!mission.tasks.some((t) =>
                            col.states.includes(t.status),
                          ) && <p className="column-empty">Nothing here yet</p>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="artifacts-surface">
                {!mission?.artifacts.length ? (
                  <div className="empty-view">
                    <Box size={32} />
                    <h2>Good work will live here</h2>
                    <p>Files appear as your teammates finish their work.</p>
                  </div>
                ) : (
                  <>
                    <div className="board-title">
                      <div>
                        <span className="subtle">Shared project memory</span>
                        <h2>Made by your team</h2>
                      </div>
                      <button
                        className="secondary"
                        onClick={() =>
                          download(
                            "hearth-mission.json",
                            JSON.stringify(mission, null, 2),
                            "application/json",
                          )
                        }
                      >
                        <Download size={15} />
                        Export all
                      </button>
                    </div>
                    <div className="artifact-list">
                      {[...mission.artifacts].reverse().map((a, i) => (
                        <button
                          key={a.id}
                          className="artifact-row"
                          onClick={() => {
                            setArtifact(a);
                            setArtifactView(
                              a.type === "html" ? "preview" : "source",
                            );
                          }}
                        >
                          <span className={`file-icon ${a.type}`}>
                            {a.type === "html" ? (
                              <Play size={22} />
                            ) : (
                              <FileText size={22} />
                            )}
                          </span>
                          <span>
                            <b>{a.name}</b>
                            <small>
                              {a.agent} · {Math.ceil(a.content.length / 1024)}{" "}
                              KB{a.type === "html" ? " · Playable app" : ""}
                            </small>
                          </span>
                          <ArrowUpRight size={17} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="office-footer">
              <span>
                <Users size={15} />
                {team.name} · {agents.length} teammates
              </span>
              <div>
                <button
                  aria-label="Zoom out"
                  onClick={() => setZoom((z) => Math.max(0.7, z - 0.1))}
                >
                  <Minus size={16} />
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  aria-label="Zoom in"
                  onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}
                >
                  <Plus size={16} />
                </button>
                <button aria-label="Reset zoom" onClick={() => setZoom(1)}>
                  <Maximize2 size={15} />
                </button>
              </div>
            </div>
            {mission ? (
              <div className="active-mission">
                <div className="active-mission-top">
                  <span className="mission-symbol">
                    <Flag size={22} />
                  </span>
                  <div className="mission-title-wrap">
                    <Select value={mission.id} onValueChange={setMissionId}>
                      <SelectTrigger
                        aria-label="Current mission"
                        className="mission-select"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {missions.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="subtle">
                      {mission.mode === "demo"
                        ? "Demo · scripted activity, no model calls"
                        : "Live · " +
                          mission.tokens.toLocaleString() +
                          " tokens used"}{" "}
                      · {done}/{mission.tasks.length} steps
                    </span>
                  </div>
                  <span className={`status-tag ${mission.status}`}>
                    {mission.status === "review"
                      ? "Ready for review"
                      : mission.status}
                  </span>
                </div>
                <Progress
                  value={(done / mission.tasks.length) * 100}
                  aria-label="Mission completion"
                  className="mission-progress"
                />
                {mission.status === "running" && mission.mode === "live" && !connected && <div className="connection-notice"><span>Waiting for a model connection.</span><button className="text-button" onClick={() => setModal("settings")}>Connect model</button></div>}
                    <div className="mission-controls">
                  <div>
                    {mission.status === "running" ? (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => control("pause")}
                      >
                        <Pause size={14} />
                        Pause
                      </button>
                    ) : ["ready", "paused", "failed"].includes(
                        mission.status,
                      ) ? (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          control(
                            mission.status === "ready" ? "start" : "resume",
                          )
                        }
                      >
                        <Play size={14} />
                        {mission.status === "ready"
                          ? "Start mission"
                          : mission.status === "failed"
                            ? "Retry step"
                            : "Resume"}
                      </button>
                    ) : mission.status === "review" ? (
                      <button
                        className="primary"
                        disabled={
                          busy ||
                          !mission.artifacts.some((a) => a.type === "html")
                        }
                        onClick={() => control("launch")}
                      >
                        <ArrowUpRight size={14} />
                        Launch app
                      </button>
                    ) : (
                      <a
                        className="primary"
                        href={"/play/" + mission.id}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open launched app
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {mission.artifacts.some((a) => a.type === "html") && (
                      <button
                        className="secondary"
                        onClick={() => {
                          setArtifact(
                            mission.artifacts
                              .filter((a) => a.type === "html")
                              .at(-1)!,
                          );
                          setArtifactView("preview");
                        }}
                      >
                        Preview
                      </button>
                    )}
                  </div>
                  {mission.parentMissionId &&
                    ["review", "complete"].includes(mission.status) && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => control("return")}
                      >
                        Return work
                      </button>
                    )}
                  <button
                    className="text-button"
                    onClick={() => setModal("collaborate")}
                  >
                    <ArrowLeftRight size={14} />
                    Collaborate
                  </button>
                </div>
                {mission.status === "running" && (
                  <p className="execution-note">
                    {mission.mode === "demo"
                      ? "Demo is playing."
                      : "Keep this office open to continue agent handoffs."}{" "}
                    You can switch teams while work continues.
                  </p>
                )}
                {mission.status === "paused" && (
                  <p className="execution-note">
                    Paused between steps. An already-running step will finish
                    and save its work.
                  </p>
                )}
              </div>
            ) : (
              <div className="mission-card">
                <div className="mission-symbol">
                  <Flag size={22} />
                </div>
                <div>
                  <span className="subtle">Your first mission</span>
                  <h2>Let’s build something worth playing.</h2>
                  <p>See a team workflow with a playable pinball demo.</p>
                </div>
                <button
                  className="secondary"
                  disabled={!loaded}
                  onClick={() => {
                    setMode("demo");
                    setPrompt(pinballPrompt);
                    setModal("mission");
                  }}
                >
                  Try the pinball mission
                  <ArrowUpRight size={16} />
                </button>
              </div>
            )}
          </section>
          <aside className="activity-panel">
            <div className="activity-heading">
              <h2>
                <Activity size={17} />
                Team activity
              </h2>
              <span className="subtle">
                {running ? "Working" : "Live view"}
              </span>
            </div>
            {mission ? (
              <>
                <Tabs
                  value={feedFilter}
                  onValueChange={setFeedFilter}
                  className="feed-tabs"
                >
                  <TabsList variant="line">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="decisions">Handoffs</TabsTrigger>
                    <TabsTrigger value="files">Files</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="activity-feed">
                  {[...events].reverse().map((e) => (
                    <div className={`feed-event event-${e.kind}`} key={e.id}>
                      <div className="event-icon">
                        {e.kind === "artifact" ? (
                          <FileText size={14} />
                        ) : e.kind === "error" ? (
                          <AlertCircle size={14} />
                        ) : e.kind === "message" ? (
                          <MessageCircle size={14} />
                        ) : (
                          <Activity size={14} />
                        )}
                      </div>
                      <div>
                        <div className="event-meta">
                          <b>{e.actor}</b>
                          <time>{time(e.at)}</time>
                        </div>
                        <p>{e.text}</p>
                        {e.tokens && (
                          <small>{e.tokens.toLocaleString()} tokens</small>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <form
                  className="team-message"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendMessage();
                  }}
                >
                  <label className="sr-only" htmlFor="team-message">
                    Message the team
                  </label>
                  <textarea
                    id="team-message"
                    placeholder="Message the team…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={2}
                    maxLength={3000}
                  />
                  <button
                    type="submit"
                    disabled={busy || !message.trim()}
                    aria-label="Send team message"
                  >
                    <ArrowUp size={17} />
                  </button>
                  <small>
                    {mission.mode === "demo"
                      ? "Saved to the log. Demo steps follow the script."
                      : "Read by the next teammate before they work."}
                  </small>
                </form>
              </>
            ) : (
              <>
                <div className="activity-intro">
                  <span className="sun-icon">☀</span>
                  <h3>A good day to make things.</h3>
                  <p>
                    Your team is in the office.
                    <br />
                    Give them something to work on.
                  </p>
                </div>
                <div className="feed">
                  <div className="feed-event">
                    <div className="event-icon">
                      <Users size={16} />
                    </div>
                    <div>
                      <b>The team has arrived</b>
                      <p>
                        {agents.length} teammates joined {team.name}.<br />
                        Ready to plan, build, and ship.
                      </p>
                    </div>
                  </div>
                  <div className="team-roster">
                    {agents.map((a) => (
                      <button key={a.id} onClick={() => inspect(a)}>
                        <Avatar color={a.color} size={32} />
                        <span>
                          {a.name}
                          <small>{a.title}</small>
                        </span>
                        <i className="live-dot" />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="activity-bottom">
              <span className="privacy-dot" />
              {mission?.mode === "demo"
                ? "Scripted demo · no tokens used"
                : "Every handoff. Every decision. In view."}
            </div>
          </aside>
        </div>
        <footer className="app-bottom">
          <span>
            <span className="live-dot" />
            {loaded ? "Workspace saved" : "Connecting to your workspace…"}
          </span>
          <span>Made for humans working with agents</span>
        </footer>
      </div>
      <Dialog
        open={modal === "mission"}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="hearth-dialog">
          <DialogTitle>A mission for {team.name}</DialogTitle>
          <DialogDescription>
            Describe the outcome. Your teammates handle the handoffs.
          </DialogDescription>
          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "demo" | "live")}
          >
            <TabsList>
              <TabsTrigger value="demo">Pinball walkthrough</TabsTrigger>
              <TabsTrigger value="live">Live agents</TabsTrigger>
            </TabsList>
          </Tabs>
          {mode === "demo" ? (
            <div className="demo-callout">
              <Play size={22} />
              <div>
                <b>Try the full workflow, without a model key.</b>
                <p>
                  A scripted six-role example with a prebuilt playable pinball
                  game. It demonstrates handoffs and launch; it does not
                  generate a new app.
                </p>
              </div>
            </div>
          ) : (
            <div className="connection-notice">
              <span className="live-dot" />
              {connected
                ? "Model connected for live work."
                : "Connect your model in Settings to run live agents."}
            </div>
          )}
          <label className="field-label" htmlFor="brief">
            What should the team build?
          </label>
          <textarea
            id="brief"
            className="mission-input"
            value={mode === "demo" ? pinballPrompt : prompt}
            readOnly={mode === "demo"}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            maxLength={6000}
          />
          {mode === "live" && (
            <>
              <p className="help-copy">
                This version builds self-contained browser apps and documents.
                It can review source and revise files; it cannot run a terminal
                or browser tests.
              </p>
              <label className="field-label" htmlFor="budget">
                Mission token budget
              </label>
              <input
                id="budget"
                className="text-input"
                type="number"
                min="10000"
                max="200000"
                step="1000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </>
          )}
          <button
            className="primary"
            disabled={busy || prompt.trim().length < 10}
            onClick={createMission}
          >
            <Plus size={16} />
            {mode === "live" && !connected ? "Connect model" : "Create mission"}
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "team"}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="hearth-dialog team-dialog">
          <DialogTitle>Good people. Ready to work.</DialogTitle>
          <DialogDescription>
            Spawn a team from a template. Every teammate can be customized.
          </DialogDescription>
          <label className="field-label" htmlFor="team-name">
            Team name
          </label>
          <input
            id="team-name"
            className="text-input"
            placeholder="e.g. Launch crew"
            maxLength={40}
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          />
          <div className="template-list">
            {templates.map((t) => (
              <button
                className="template-card"
                key={t.id}
                disabled={busy || !loaded}
                onClick={async () => {
                  const r = await mutate({
                    action: "team",
                    name: teamName.trim() || t.name,
                    template: t.id,
                  });
                  if (r) {
                    setTeamId(r.workspace.teams.at(-1)!.id);
                    setMissionId("");
                    setModal(null);
                    setTeamName("");
                    setView("office");
                  }
                }}
              >
                <span className="template-icon">{t.icon}</span>
                <div>
                  <h3>{t.name}</h3>
                  <p>{t.description}</p>
                  <div className="template-avatars">
                    {roles
                      .filter((r) => t.roles.includes(r.role))
                      .map((r) => (
                        <Avatar key={r.role} color={r.color} size={27} />
                      ))}
                    <small>{t.roles.length} teammates</small>
                  </div>
                </div>
                <Plus size={18} />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!agent} onOpenChange={(v) => !v && setAgent(null)}>
        <DialogContent className="hearth-dialog">
          <div className="agent-dialog-heading">
            <Avatar color={agent?.color || "#888"} size={58} />
            <div>
              <DialogTitle>{agent?.name}</DialogTitle>
              <DialogDescription>
                {agent?.title} · {team.name}
              </DialogDescription>
            </div>
          </div>
          <label className="field-label" htmlFor="agent-name">
            Name
          </label>
          <input
            className="text-input"
            id="agent-name"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            maxLength={32}
          />
          <label className="field-label" htmlFor="agent-instructions">
            Role & working instructions
          </label>
          <textarea
            className="mission-input"
            id="agent-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
            maxLength={6000}
          />
          <span className="field-label">Available operations</span>
          <div className="tool-pills">
            {agent?.tools.map((t) => (
              <span key={t}>{t.replaceAll("_", " ")}</span>
            ))}
          </div>
          <p className="help-copy">
            Teammates read the brief, files, and team messages. Instructions
            apply on their next turn. Operations are restricted to this
            workspace.
          </p>
          <button
            className="primary"
            disabled={
              busy || instructions.trim().length < 30 || !agentName.trim()
            }
            onClick={async () => {
              const r = await mutate({
                action: "agent",
                id: agent?.id,
                name: agentName,
                instructions,
              });
              if (r) setAgent(null);
            }}
          >
            <Check size={16} />
            Save teammate
          </button>
          {mission && (
            <div className="agent-message">
              <label className="field-label" htmlFor="direct-message">
                Leave {agent?.name} a note
              </label>
              <textarea
                className="mission-input"
                id="direct-message"
                rows={2}
                placeholder="Something to consider on your next turn…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <button
                className="secondary"
                disabled={busy || !message.trim()}
                onClick={sendMessage}
              >
                <Send size={14} />
                Send note
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "settings"}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="hearth-dialog">
          <DialogTitle>Workspace settings</DialogTitle>
          <DialogDescription>
            Connect the model that powers your live teammates.
          </DialogDescription>
          <div className="connection-card">
            <KeyRound size={20} />
            <div>
              <b>
                {connected
                  ? "Model connection ready"
                  : "Demo mode is ready to explore"}
              </b>
              <p>
                {serverConnected
                  ? "A server-side model key is configured."
                  : "Add an OpenAI API key to generate apps from your own prompts."}
              </p>
            </div>
          </div>
          <label htmlFor="api-key" className="field-label">
            API key for this tab
          </label>
          <input
            id="api-key"
            className="text-input"
            type="password"
            autoComplete="off"
            placeholder="sk-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value.trim())}
          />
          <p className="help-copy">
            Held only in this tab’s memory. Sent to the server over your
            connection, then to OpenAI for live calls. Never saved in workspace
            records. Refreshing clears it.
          </p>
          <label htmlFor="model-name" className="field-label">
            Model
          </label>
          <input
            id="model-name"
            className="text-input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-5.2"
          />
          <div className="settings-facts">
            <p>
              <b>Execution</b>One teammate at a time, with shared files and
              review loops. Keep this office open to advance the work.
            </p>
            <p>
              <b>Launch</b>Private workspace links. Generated code runs in an
              isolated preview with network access disabled.
            </p>
            <p>
              <b>Usage</b>Live calls use your API account. Each mission has a
              token budget; token estimates before calls are approximate.
            </p>
          </div>
          <button className="primary" onClick={() => setModal(null)}>
            <Check size={16} />
            Done
          </button>
          <button
            className="text-button"
            onClick={() => {
              download(
                "hearth-workspace.json",
                JSON.stringify(ws, null, 2),
                "application/json",
              );
            }}
          >
            <Download size={15} />
            Export workspace
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "collaborate"}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="hearth-dialog">
          <DialogTitle>Bring another team into the work</DialogTitle>
          <DialogDescription>
            Create a linked brief with a copy of this mission’s files.
          </DialogDescription>
          {ws.teams.length < 2 ? (
            <>
              <p>Spawn a second team to collaborate with {team.name}.</p>
              <button className="primary" onClick={() => setModal("team")}>
                <Plus size={16} />
                Spawn another team
              </button>
            </>
          ) : (
            <>
              <label className="field-label">Send to team</label>
              <Select value={collabTeam} onValueChange={setCollabTeam}>
                <SelectTrigger aria-label="Collaborating team">
                  <SelectValue placeholder="Choose a team" />
                </SelectTrigger>
                <SelectContent>
                  {ws.teams
                    .filter((t) => t.id !== team.id)
                    .map((t) => (
                      <SelectItem value={t.id} key={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <label htmlFor="collab-brief" className="field-label">
                What do you need from them?
              </label>
              <textarea
                id="collab-brief"
                className="mission-input"
                rows={4}
                value={collabBrief}
                onChange={(e) => setCollabBrief(e.target.value)}
                placeholder="Review the game’s interface and improve the touch controls…"
              />
              <p className="help-copy">
                Their mission starts ready, with the current files as context.
                Demo collaboration uses scripted steps. Live collaboration
                follows your brief.
              </p>
              <button
                className="primary"
                disabled={
                  busy ||
                  !collabTeam ||
                  collabTeam === team.id ||
                  collabBrief.trim().length < 10
                }
                onClick={async () => {
                  const r = await mutate({
                    action: "collaborate",
                    id: mission?.id,
                    teamId: collabTeam,
                    brief: collabBrief,
                  });
                  if (r) {
                    setTeamId(collabTeam);
                    setMissionId(r.workspace.missions[0].id);
                    setModal(null);
                    setCollabBrief("");
                  }
                }}
              >
                <ArrowLeftRight size={16} />
                Create collaboration
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!artifact} onOpenChange={(v) => !v && setArtifact(null)}>
        <DialogContent
          className={`artifact-dialog ${artifact?.type === "html" ? "game-dialog" : ""}`}
        >
          <div className="artifact-dialog-top">
            <div>
              <DialogTitle>{artifact?.name}</DialogTitle>
              <DialogDescription>
                {artifact?.agent} ·{" "}
                {mission?.mode === "demo"
                  ? "Prebuilt demonstration artifact"
                  : "Generated team artifact"}
              </DialogDescription>
            </div>
            <button
              className="secondary"
              onClick={() =>
                artifact &&
                download(
                  artifact.name,
                  artifact.content,
                  artifact.type === "html" ? "text/html" : "text/markdown",
                )
              }
            >
              <Download size={15} />
              Download
            </button>
          </div>
          {artifact?.type === "html" && (
            <Tabs value={artifactView} onValueChange={setArtifactView}>
              <TabsList>
                <TabsTrigger value="preview">Play preview</TabsTrigger>
                <TabsTrigger value="source">Source</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {artifact?.type === "html" && artifactView === "preview" ? (
            <iframe
              className="artifact-preview"
              title="Playable app preview"
              srcDoc={safeDocument(artifact.content)}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
            />
          ) : (
            <pre className="artifact-source">{artifact?.content}</pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
