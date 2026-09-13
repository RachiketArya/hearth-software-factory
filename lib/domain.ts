export type Role =
  "pm" | "backend" | "frontend" | "designer" | "qa" | "manager";
export type Agent = {
  id: string;
  name: string;
  role: Role;
  title: string;
  color: string;
  instructions: string;
  tools: string[];
  teamId: string;
};
export type Team = {
  id: string;
  name: string;
  template: string;
  description: string;
};
export type Task = {
  id: string;
  title: string;
  role: Role;
  status: "queued" | "working" | "done" | "blocked";
  summary?: string;
};
export type Event = {
  id: string;
  at: string;
  kind: string;
  actor: string;
  text: string;
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  model?: string;
};
export type Artifact = {
  id: string;
  name: string;
  content: string;
  type: "html" | "markdown" | "code";
  agent: string;
};
export type Mission = {
  id: string;
  teamId: string;
  title: string;
  prompt: string;
  mode: "demo" | "live";
  status: "ready" | "running" | "paused" | "review" | "complete" | "failed";
  tasks: Task[];
  events: Event[];
  artifacts: Artifact[];
  tokens: number;
  maxTokens: number;
  budgetRequiredTotal?: number;
  createdAt: string;
  step: number;
  parentMissionId?: string;
  lease?: string;
  leaseUntil?: number;
};
export type Workspace = { teams: Team[]; agents: Agent[]; missions: Mission[] };
export const roles: {
  role: Role;
  name: string;
  title: string;
  color: string;
  instructions: string;
  tools: string[];
}[] = [
  {
    role: "pm",
    name: "Maya",
    title: "Product manager",
    color: "#ba8557",
    instructions:
      "Turn the mission into a concise product brief and measurable acceptance criteria. Resolve ambiguity with reasonable explicit assumptions. Hand the brief to design and engineering.",
    tools: ["read_shared_memory", "write_artifact", "handoff"],
  },
  {
    role: "designer",
    name: "Luna",
    title: "Designer",
    color: "#ab82c6",
    instructions:
      "Create an intentional visual and interaction specification. Define layout, palette, controls, accessible behavior and responsive design. Read the product brief first.",
    tools: ["read_shared_memory", "write_artifact", "handoff"],
  },
  {
    role: "backend",
    name: "Theo",
    title: "Backend engineer",
    color: "#6996bd",
    instructions:
      "Design state, data flow and the core logic. For games implement physics and scoring. Provide actual JavaScript implementation and clear interfaces the frontend can integrate.",
    tools: ["read_shared_memory", "write_artifact", "handoff"],
  },
  {
    role: "frontend",
    name: "Finn",
    title: "Frontend engineer",
    color: "#739a67",
    instructions:
      "Build a complete working deliverable using the brief, design and core logic. Write a self-contained index.html with embedded CSS and JavaScript. No external dependencies or network requests. Include keyboard and touch controls.",
    tools: ["read_shared_memory", "write_artifact", "handoff"],
  },
  {
    role: "qa",
    name: "Iris",
    title: "QA engineer",
    color: "#d191a0",
    instructions:
      "Review the actual source against acceptance criteria and inspect logic for bugs, accessibility and edge cases. Report concrete findings. Never claim to have executed browser tests. If needed produce a corrected complete index.html.",
    tools: ["read_shared_memory", "write_artifact", "request_changes"],
  },
  {
    role: "manager",
    name: "Alex",
    title: "Engineering manager",
    color: "#8881bc",
    instructions:
      "Review all work and QA findings. Resolve remaining issues by writing a corrected complete index.html if needed. Summarize delivery and remaining risks honestly. Prepare the artifact for a human to launch.",
    tools: ["read_shared_memory", "write_artifact", "request_launch"],
  },
];
export function makeTeam(name = "Engineering", template = "engineering") {
  const id = crypto.randomUUID();
  const chosen =
    template === "lean"
      ? roles.filter((r) => ["pm", "frontend", "qa"].includes(r.role))
      : template === "design"
        ? roles.filter((r) =>
            ["pm", "designer", "frontend", "qa"].includes(r.role),
          )
        : roles;
  return {
    team: {
      id,
      name,
      template,
      description:
        template === "lean"
          ? "A focused build-and-review trio"
          : template === "design"
            ? "From idea to polished interface"
            : "A complete product engineering team",
    },
    agents: chosen.map((r) => ({ ...r, id: crypto.randomUUID(), teamId: id })),
  };
}
export function initialWorkspace(): Workspace {
  const t = makeTeam();
  return { teams: [t.team], agents: t.agents, missions: [] };
}
export const pinballPrompt =
  "Build and launch a 3D-looking pinball game. Give it a midnight arcade aesthetic, realistic ball physics, two flippers, bumpers, a score counter, three lives, keyboard and touch controls, and a restart button. Make it playable in a browser without installing anything.";
export function makeMission(
  teamId: string,
  prompt: string,
  mode: "demo" | "live",
  agents: Agent[],
): Mission {
  return {
    id: crypto.randomUUID(),
    teamId,
    title: mode === "demo" ? "Midnight pinball" : prompt.slice(0, 56),
    prompt,
    mode,
    status: "ready",
    tasks: agents.map((a) => ({
      id: crypto.randomUUID(),
      role: a.role,
      title: {
        pm: "Define the product",
        designer: "Design the experience",
        backend: "Build the core logic",
        frontend: "Build the playable app",
        qa: "Review quality",
        manager: "Prepare for launch",
      }[a.role],
      status: "queued",
    })),
    events: [
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: "mission",
        actor: "You",
        text: "Created the mission. The team is ready to get started.",
      },
    ],
    artifacts: [],
    tokens: 0,
    maxTokens: 60000,
    step: 0,
    createdAt: new Date().toISOString(),
  };
}

export function isPlayableArtifact(a: Artifact) {
  return a.type === "html" && /\.html?$/i.test(a.name);
}
