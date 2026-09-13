import { env } from "cloudflare:workers";
import { z } from "zod";
import { mutate, read } from "@/lib/store";
import { event } from "@/lib/runner";
import { STUDIO_REPO, STUDIO_URL } from "@/lib/studio";
export const dynamic = "force-dynamic";
async function authorize(req: Request) {
  const expected = (env as any).STUDIO_RUNNER_SECRET as string | undefined,
    owner = (env as any).STUDIO_OWNER_ID as string | undefined;
  if (!expected || !owner) throw Error("Studio runner unavailable.");
  const supplied =
    req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [a, b] = await Promise.all([digest(expected), digest(supplied)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff) throw Error("Runner authorization required.");
  return owner;
}
const schema = z.object({
  action: z.enum([
    "poll",
    "claim",
    "heartbeat",
    "progress",
    "finish",
    "fail",
    "usage",
    "checkpoint",
  ]),
  id: z.string().max(100).optional(),
  lease: z.string().max(100).optional(),
  state: z.string().max(500000).optional(),
  usageId: z.string().max(100).optional(),
  tokens: z.number().int().min(0).max(200000).optional(),
  runUrl: z
    .string()
    .regex(
      /^https:\/\/github.com\/fabianchua6\/chatjipiti-game\/actions\/runs\/\d+$/,
    )
    .optional(),
  task: z.number().int().min(0).max(30).optional(),
  done: z.boolean().optional(),
  text: z.string().max(12000).optional(),
  phase: z.string().max(60).optional(),
  branch: z
    .string()
    .regex(/^hearth\/[a-zA-Z0-9_-]+$/)
    .optional(),
  baseSha: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .optional(),
  commitSha: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .optional(),
  prUrl: z
    .string()
    .regex(/^https:\/\/github.com\/fabianchua6\/chatjipiti-game\/pull\/\d+$/)
    .optional(),
  deploymentId: z.string().max(200).optional(),
  checks: z
    .array(
      z.object({
        name: z.enum(["rules", "build", "browser"]),
        status: z.enum(["passed", "failed"]),
        detail: z.string().max(3000),
      }),
    )
    .max(3)
    .optional(),
});
export async function POST(req: Request) {
  try {
    const owner = await authorize(req);
    const raw = await req.text();
    if (raw.length > 550000) throw Error("Request too large.");
    const p = schema.parse(JSON.parse(raw));
    if (p.action === "poll") {
      const { workspace } = await read(owner);
      return Response.json(
        {
          jobs: workspace.missions
            .filter(
              (m) =>
                m.repository &&
                ["running", "paused", "review", "failed"].includes(m.status),
            )
            .map((m) => ({
              id: m.id,
              title: m.title,
              status: m.status,
              phase: m.repository!.phase,
              step: m.step,
              leaseUntil: m.leaseUntil,
              claimed: !!m.lease,
              repository: m.repository,
            })),
          repo: STUDIO_REPO,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    let result: any;
    await mutate(owner, (ws) => {
      const m = ws.missions.find(
        (m) => m.id === p.id && m.repository?.repo === STUDIO_REPO,
      );
      if (!m) throw Error("Studio mission not found.");
      const r = m.repository!;
      if (p.action === "claim") {
        if (m.status !== "running") throw Error("Mission is not running.");
        if (m.lease) {
          throw Error(
            m.leaseUntil && m.leaseUntil > Date.now()
              ? "Mission already claimed."
              : "Previous runner lease expired. Ask the owner to pause and resume this mission before recovery.",
          );
        }
        m.lease = crypto.randomUUID();
        m.leaseUntil = Date.now() + 15 * 60000;
        r.claimedAt = new Date().toISOString();
        r.lastHeartbeat = r.claimedAt;
        r.phase = "reading_repository";
        if (p.runUrl) r.runUrl = p.runUrl;
        event(
          m,
          "Hearth",
          "started",
          "Repository runner claimed the mission. Reading the current studio and its game conventions.",
        );
      } else {
        if (
          !p.lease ||
          m.lease !== p.lease ||
          !m.leaseUntil ||
          m.leaseUntil < Date.now()
        )
          throw Error("Runner lease is invalid or expired.");
        if (!["running", "paused", "review"].includes(m.status))
          throw Error("Mission is not active.");
        m.leaseUntil = Date.now() + 15 * 60000;
        r.lastHeartbeat = new Date().toISOString();
        if (p.action === "heartbeat" && m.status === "paused") {
          delete m.lease;
          delete m.leaseUntil;
          r.phase = "paused";
          event(
            m,
            "Hearth",
            "control",
            "Repository runner paused before its next action.",
          );
        } else if (p.action === "usage") {
          if (!p.usageId || p.tokens === undefined)
            throw Error("Usage ID and tokens required.");
          r.usageIds ||= [];
          if (!r.usageIds.includes(p.usageId)) {
            m.tokens += p.tokens;
            r.usageIds.push(p.usageId);
            event(
              m,
              "Cloud runner",
              "usage",
              `${p.tokens.toLocaleString()} API tokens used.`,
              p.tokens,
            );
          }
        } else if (p.action === "checkpoint") {
          if (!p.state) throw Error("Checkpoint required.");
          const existing = m.artifacts.find(
            (a) => a.name === "studio-state.json",
          );
          if (existing) existing.content = p.state;
          else
            m.artifacts.push({
              id: crypto.randomUUID(),
              name: "studio-state.json",
              content: p.state,
              type: "code",
              agent: "Cloud runner",
            });
        } else if (p.action === "fail") {
          if (m.status === "paused") {
            delete m.lease;
            delete m.leaseUntil;
            r.phase = "paused";
            result = {
              mission: m,
              agents: ws.agents.filter((a) => a.teamId === m.teamId),
            };
            return;
          }
          m.status = "failed";
          r.phase = "failed";
          if (m.tasks[m.step]) m.tasks[m.step].status = "blocked";
          event(
            m,
            "Hearth",
            "error",
            p.text || "Repository run failed. Completed work is preserved.",
          );
          delete m.lease;
          delete m.leaseUntil;
        } else if (p.action === "progress") {
          if (m.status === "paused")
            throw Error(
              "Mission paused. Stop work and acknowledge with heartbeat.",
            );
          if (p.task !== m.step || !m.tasks[m.step])
            throw Error("Update does not match the current task.");
          const t = m.tasks[m.step],
            agent = ws.agents.find(
              (a) => a.teamId === m.teamId && a.role === t.role,
            );
          t.status = p.done ? "done" : "working";
          if (p.done) t.summary = p.text || "Completed.";
          event(
            m,
            agent?.name || t.role,
            p.done ? "handoff" : "started",
            p.text || t.title,
          );
          if (p.done) m.step++;
          if (p.phase) r.phase = p.phase;
          if (p.branch) r.branch = p.branch;
          if (p.baseSha) r.baseSha = p.baseSha;
          if (p.commitSha) r.commitSha = p.commitSha;
          if (p.prUrl) r.prUrl = p.prUrl;
          if (p.checks) r.checks = p.checks;
          if (m.step === m.tasks.length) m.status = "review";
        } else if (p.action === "finish") {
          if (m.status === "paused")
            throw Error("Mission paused. Do not publish.");
          if (
            m.step !== m.tasks.length ||
            !r.commitSha ||
            !p.deploymentId ||
            !["rules", "build", "browser"].every((name) =>
              r.checks.some((c) => c.name === name && c.status === "passed"),
            )
          )
            throw Error(
              "Complete all tasks and all three checks before recording a release.",
            );
          r.deploymentId = p.deploymentId;
          r.phase = "released";
          r.siteUrl = STUDIO_URL;
          m.status = "complete";
          delete m.lease;
          delete m.leaseUntil;
          event(
            m,
            "Hearth",
            "launch",
            `Released commit ${r.commitSha.slice(0, 12)} to ${STUDIO_URL}.`,
          );
        }
      }
      result = {
        mission: m,
        agents: ws.agents.filter((a) => a.teamId === m.teamId),
        lease: m.lease,
      };
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? "Invalid runner update."
            : (e as Error).message,
      },
      { status: 400 },
    );
  }
}
