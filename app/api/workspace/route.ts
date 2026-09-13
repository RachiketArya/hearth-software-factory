import { z } from "zod";
import { access, accessInfo, requireOwner, displayName } from "@/lib/access";
import { env } from "cloudflare:workers";
import { read, mutate, owner, checkOrigin } from "@/lib/store";
import {
  makeTeam,
  makeMission,
  pinballPrompt,
  isPlayableArtifact,
} from "@/lib/domain";
import { event } from "@/lib/runner";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const a = await access(req);
    return Response.json(
      {
        ...(await read(a.workspaceId)),
        access: await accessInfo(a),
        connected: a.role === "owner" && !!(env as any).OPENAI_API_KEY,
        model: (env as any).OPENAI_MODEL || "gpt-5.2",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: (e as { status?: number }).status || 503 },
    );
  }
}
const id = z.string().min(1).max(100);
const action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("budget"),
    id,
    maxTokens: z.number().int().min(10000).max(200000),
  }),
  z.object({
    action: z.literal("team"),
    name: z.string().trim().min(1).max(40),
    template: z.enum(["engineering", "lean", "design"]),
  }),
  z.object({
    action: z.literal("agent"),
    id,
    name: z.string().trim().min(1).max(32),
    instructions: z.string().trim().min(30).max(6000),
  }),
  z.object({
    action: z.literal("mission"),
    teamId: id,
    prompt: z.string().trim().min(10).max(6000),
    mode: z.enum(["demo", "live"]),
    maxTokens: z.number().int().min(10000).max(200000).optional(),
  }),
  z.object({
    action: z.literal("control"),
    id,
    command: z.enum(["start", "pause", "resume", "launch", "return"]),
  }),
  z.object({
    action: z.literal("message"),
    id,
    text: z.string().trim().min(1).max(3000),
    agentId: id.optional(),
  }),
  z.object({
    action: z.literal("collaborate"),
    id,
    teamId: id,
    brief: z.string().trim().min(10).max(3000),
  }),
]);
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    if (Number(req.headers.get("content-length") || 0) > 20000)
      throw new Error("Request too large.");
    const a = action.parse(await req.json());
    const auth = await access(req);
    if (
      auth.role !== "owner" &&
      !(
        auth.role === "collaborator" &&
        (a.action === "message" ||
          (a.action === "control" && a.command === "pause"))
      )
    )
      requireOwner(auth);
    const actor = await displayName(auth.userId);
    const result = await mutate(auth.workspaceId, (ws) => {
      const priorEvents = new Set(
        ws.missions.flatMap((m) => m.events.map((e) => e.id)),
      );
      if (a.action === "team") {
        if (ws.teams.length >= 12)
          throw new Error("This workspace supports up to 12 teams.");
        const t = makeTeam(a.name, a.template);
        ws.teams.push(t.team);
        ws.agents.push(...t.agents);
      } else if (a.action === "agent") {
        const agent = ws.agents.find((v) => v.id === a.id);
        if (!agent) throw new Error("Teammate not found.");
        agent.name = a.name;
        agent.instructions = a.instructions;
      } else if (a.action === "mission") {
        if (ws.missions.length >= 30)
          throw new Error("This prototype supports 30 missions per workspace.");
        const team = ws.teams.find((t) => t.id === a.teamId);
        if (!team) throw new Error("Team not found.");
        const mission = makeMission(
          a.teamId,
          a.mode === "demo" ? pinballPrompt : a.prompt,
          a.mode,
          ws.agents.filter((v) => v.teamId === a.teamId),
        );
        mission.maxTokens = a.maxTokens || 60000;
        ws.missions.unshift(mission);
      } else {
        const m = ws.missions.find((v) => v.id === a.id);
        if (!m) throw new Error("Mission not found.");
        if (a.action === "budget") {
          if (
            m.status === "running" ||
            (m.leaseUntil && m.leaseUntil > Date.now())
          )
            throw new Error(
              "Pause and let the current step finish before changing its budget.",
            );
          if (a.maxTokens < m.tokens)
            throw new Error(
              "The budget cannot be lower than tokens already used.",
            );
          const previous = m.maxTokens;
          m.maxTokens = a.maxTokens;
          if (m.budgetRequiredTotal && a.maxTokens >= m.budgetRequiredTotal)
            delete m.budgetRequiredTotal;
          event(
            m,
            actor,
            "budget",
            `Changed the mission budget from ${previous.toLocaleString()} to ${a.maxTokens.toLocaleString()} tokens. Completed work and usage are preserved.`,
          );
        }
        if (a.action === "message") {
          const agent = a.agentId
            ? ws.agents.find((v) => v.id === a.agentId && v.teamId === m.teamId)
            : null;
          if (a.agentId && !agent)
            throw new Error("Teammate not found in this team.");
          event(
            m,
            actor,
            "message",
            `${agent ? "@" + agent.name + " " : ""}${a.text}`,
          );
        }
        if (a.action === "control") {
          if (a.command === "return") {
            if (
              !["review", "complete"].includes(m.status) ||
              !m.parentMissionId
            )
              throw new Error(
                "Finish a collaboration before returning its work.",
              );
            const parent = ws.missions.find((v) => v.id === m.parentMissionId);
            if (!parent) throw new Error("Original mission not found.");
            const existing = new Set(parent.artifacts.map((v) => v.id));
            const added = m.artifacts.filter((v) => !existing.has(v.id));
            parent.artifacts.push(...structuredClone(added));
            event(
              parent,
              "Hearth",
              "handoff",
              `${ws.teams.find((t) => t.id === m.teamId)?.name} returned ${added.length} artifacts from ${m.title}. Review them under Deliverables.`,
            );
            event(
              m,
              actor,
              "handoff",
              "Returned completed work to the original team.",
            );
          } else if (a.command === "pause") {
            if (m.status !== "running")
              throw new Error("Only a running mission can be paused.");
            m.status = "paused";
            event(
              m,
              actor,
              "control",
              "Paused the mission. Any current step will finish and save; no new step will start.",
            );
          } else if (a.command === "launch") {
            if (m.status !== "review")
              throw new Error(
                "Finish the mission and review the deliverables first.",
              );
            if (!m.artifacts.some(isPlayableArtifact))
              throw new Error(
                "There is no playable app to launch. You can still export the documents.",
              );
            m.status = "complete";
            event(
              m,
              actor,
              "launch",
              "Launched the app to a private workspace link.",
            );
          } else {
            if (!["ready", "paused", "failed"].includes(m.status))
              throw new Error(
                "This mission cannot be started in its current state.",
              );
            if (m.tokens >= m.maxTokens)
              throw new Error(
                "Update this mission’s budget to continue. Completed work is saved.",
              );
            m.status = "running";
            if (m.tasks[m.step]?.status === "blocked")
              m.tasks[m.step].status = "queued";
            event(
              m,
              actor,
              "control",
              a.command === "start"
                ? "Started the mission."
                : "Resumed the mission.",
            );
          }
        }
        if (a.action === "collaborate") {
          if (a.teamId === m.teamId)
            throw new Error("Choose a different team.");
          const team = ws.teams.find((t) => t.id === a.teamId);
          if (!team) throw new Error("Team not found.");
          if (ws.missions.length >= 30)
            throw new Error("Mission limit reached.");
          const other = makeMission(
            a.teamId,
            `Collaboration request from ${ws.teams.find((t) => t.id === m.teamId)?.name}.\n\n${a.brief}\n\nOriginal mission: ${m.prompt}`,
            m.mode,
            ws.agents.filter((v) => v.teamId === a.teamId),
          );
          other.parentMissionId = m.id;
          other.title = "Collaboration: " + a.brief.slice(0, 42);
          other.artifacts = structuredClone(m.artifacts);
          event(
            other,
            "Hearth",
            "message",
            `Copied ${m.artifacts.length} shared artifacts from ${m.title}. This team works independently; share its results back when ready.`,
          );
          event(
            m,
            actor,
            "handoff",
            `Asked ${team.name} to collaborate: ${a.brief}`,
          );
          ws.missions.unshift(other);
        }
      }
      for (const m of ws.missions)
        for (const e of m.events) {
          if (
            !priorEvents.has(e.id) &&
            (e.actor === actor || e.actor === "You")
          ) {
            e.actor = actor;
            e.humanId = auth.userId;
          }
        }
    });
    return Response.json({ ...result, access: await accessInfo(auth) });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? "Please check the required fields and text lengths."
            : (e as Error).message,
      },
      { status: (e as { status?: number }).status || 400 },
    );
  }
}
