import { z } from "zod";
import { env } from "cloudflare:workers";
import { Agent, Mission, Event, Workspace, isPlayableArtifact } from "./domain";
import { demoResult } from "./demo";
import { mutate, read } from "./store";
export function event(
  m: Mission,
  actor: string,
  kind: string,
  text: string,
  tokens?: number,
) {
  m.events.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor,
    kind,
    text,
    ...(tokens ? { tokens } : {}),
  });
}
const resultSchema = z.object({
  summary: z.string().min(1).max(10000),
  artifacts: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9_.-]+$/),
        type: z.enum(["html", "markdown", "code"]),
        content: z.string().min(1).max(160000),
      }),
    )
    .max(4),
  edits: z
    .array(
      z.object({
        name: z.string().max(100),
        find: z.string().min(1).max(20000),
        replace: z.string().max(40000),
      }),
    )
    .max(12)
    .default([]),
  request_changes: z.string().nullable(),
});
export const outputLimits = {
  pm: 1800,
  designer: 2400,
  backend: 4500,
  frontend: 12000,
  qa: 3000,
  manager: 2500,
};

export class BudgetPause extends Error {
  code = "budget";
  constructor(
    public requiredTotal: number,
    public inputTokens: number,
    public outputTokens: number,
  ) {
    super(
      `Paused before the next model call: it needs ${inputTokens.toLocaleString()} input tokens and up to ${outputTokens.toLocaleString()} output tokens. Increase this mission’s budget to at least ${requiredTotal.toLocaleString()} to continue. Completed work is saved.`,
    );
  }
}

export function latestArtifacts(mission: Mission) {
  const files = new Map<string, Mission["artifacts"][number]>();
  for (const artifact of mission.artifacts) {
    // Legacy reviews occasionally reused index.html for Markdown notes.
    if (
      files.has(artifact.name) &&
      isPlayableArtifact(files.get(artifact.name)!) &&
      !isPlayableArtifact(artifact)
    )
      continue;
    files.set(artifact.name, artifact);
  }
  return [...files.values()];
}

export function modelPayload(agent: Agent, mission: Mission, model: string) {
  const latest = latestArtifacts(mission);
  const app = [...latest].reverse().find(isPlayableArtifact);
  const manager = agent.role === "manager";
  const reviewing = agent.role === "qa" || manager;
  const revising =
    agent.role === "frontend" &&
    !!app &&
    mission.tasks[mission.step].title.startsWith("Revise");
  const files = latest.filter((a) => {
    // The complete app supersedes lower-level implementation files for review.
    if (manager) return /qa|review|delivery/i.test(a.name);
    if (agent.role === "qa" && /qa|review|delivery/i.test(a.name)) return false;
    if (
      (reviewing || revising) &&
      app &&
      a.id !== app.id &&
      (a.type === "html" || /\.(js|ts|css)$/.test(a.name))
    )
      return false;
    return true;
  });
  const context = {
    mission: mission.prompt,
    teammate: manager
      ? "Write a concise delivery note about completed work. Do not implement or revise code."
      : agent.instructions,
    task: mission.tasks[mission.step].title,
    shared_memory: files.map((a) => ({ name: a.name, content: a.content })),
    completed_work: manager
      ? mission.tasks
          .filter((t) => t.status === "done")
          .map((t) => ({ role: t.role, summary: t.summary }))
      : undefined,
    conversation: mission.events
      .filter(
        (e) =>
          e.kind === "message" || (agent.role !== "qa" && e.kind === "review"),
      )
      .slice(-12)
      .map((e) => ({ actor: e.actor, text: e.text })),
  };
  const input = JSON.stringify(context);
  if (input.length > 300000)
    throw new Error(
      "The current project files exceed this runner’s context limit. Your work is saved; create a focused collaboration with the relevant files.",
    );
  const rolePolicy = {
    pm: "Write one product brief of at most 300 words. For a simple game, keep scope small and concrete.",
    designer:
      "Write one design spec of at most 400 words. Preserve the requested scope. Do not add unnecessary features.",
    backend:
      "Provide concise core logic and integration guidance. Avoid implementing a separate UI or duplicate complete app.",
    frontend:
      "Write a complete self-contained index.html. Keep implementation concise and functional. Include keyboard and touch controls. It runs in an opaque-origin sandbox: localStorage/sessionStorage may throw; guard access or use in-memory fallback. No external dependencies or requests.",
    qa: "Review only the current HTML source against the brief. Previous review findings may have been fixed: independently trace the current code, and include the exact current function or code fragment supporting each blocker. Return one concise markdown review, at most 400 words. NEVER rewrite or echo the app source. For concrete blocking bugs, put actionable details in request_changes so frontend can fix them; otherwise null. Do not request changes for speculative enhancements. The preview uses an opaque origin: browser storage access must be guarded. Source review is not browser execution.",
    manager:
      "Prepare a short delivery note, at most 200 words, based on completed work and the QA report. NEVER rewrite the app. You are releasing reviewed work, not creating another implementation. Do not invent new requirements or claim executed tests.",
  }[agent.role];
  const payload = {
    model,
    instructions: `You are ${agent.name}, the ${agent.title} in an AI engineering team. Perform the assigned task. Read the supplied project data and return actual files in artifacts. Summary must be under 80 words. Use flat artifact filenames such as snake-core.js; never use directories, slashes, or spaces in filenames. You have no shell, browser or deployment tool; never claim otherwise. This role policy takes precedence over conflicting legacy teammate instructions: ${rolePolicy} ${revising ? "An app already exists. Make targeted edits using edits [{name,find,replace}] instead of returning the entire HTML again. Each find must match exactly once in the latest file. Include only the changes necessary for the review request. Do not include edited files in artifacts." : "Return edits as an empty array. Only a frontend revision may edit existing files."}`,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "teammate_work",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string", maxLength: 700 },
            artifacts: {
              type: "array",
              maxItems: reviewing ? 1 : 3,
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    pattern:
                      agent.role === "qa"
                        ? "^qa-review\\.md$"
                        : "^[a-zA-Z0-9_.-]+$",
                    maxLength: 100,
                  },
                  type: {
                    type: "string",
                    enum:
                      agent.role === "frontend"
                        ? ["html", "markdown", "code"]
                        : agent.role === "backend"
                          ? ["code", "markdown"]
                          : ["markdown"],
                  },
                  content: {
                    type: "string",
                    maxLength: {
                      pm: 2200,
                      designer: 3200,
                      backend: 18000,
                      frontend: 120000,
                      qa: 3200,
                      manager: 1800,
                    }[agent.role],
                  },
                },
                required: ["name", "type", "content"],
                additionalProperties: false,
              },
            },
            edits: {
              type: "array",
              maxItems: revising ? 8 : 0,
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  find: { type: "string" },
                  replace: { type: "string" },
                },
                required: ["name", "find", "replace"],
                additionalProperties: false,
              },
            },
            request_changes:
              agent.role === "qa"
                ? { type: ["string", "null"], maxLength: 2000 }
                : { type: "null" },
          },
          required: ["summary", "artifacts", "edits", "request_changes"],
          additionalProperties: false,
        },
      },
    },
  };
  if (manager) {
    payload.instructions =
      "You are the engineering manager closing a completed task. The app already exists and QA has reviewed it. Return ONLY a concise factual release summary and notes (under 200 words total). Describe what shipped, QA findings and remaining limitations. Never implement an app, return source code, or claim tests were executed. Do not reproduce files.";
    (payload.text.format as any).schema = {
      type: "object",
      properties: { summary: { type: "string" }, notes: { type: "string" } },
      required: ["summary", "notes"],
      additionalProperties: false,
    };
  }
  return payload;
}

export async function execute(
  agent: Agent,
  mission: Mission,
  key: string,
  model: string,
) {
  const payload = modelPayload(agent, mission, model);
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const count = await fetch(
    "https://api.openai.com/v1/responses/input_tokens",
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!count.ok)
    throw new Error(
      count.status === 401
        ? "The model API key was rejected. Update the connection in Settings."
        : `Could not measure this turn’s input (${count.status}). No generation was started; retry the step.`,
    );
  const measured = (await count.json()) as { input_tokens?: number };
  if (!Number.isInteger(measured.input_tokens) || measured.input_tokens! < 0)
    throw new Error(
      "The model did not return a valid input-token count. No generation was started.",
    );
  const inputTokens = measured.input_tokens!;
  const outputTokens =
    agent.role === "frontend" &&
    latestArtifacts(mission).some(isPlayableArtifact) &&
    mission.tasks[mission.step].title.startsWith("Revise")
      ? 4000
      : outputLimits[agent.role];
  const requiredTotal = mission.tokens + inputTokens + outputTokens;
  if (requiredTotal > mission.maxTokens)
    throw new BudgetPause(requiredTotal, inputTokens, outputTokens);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...payload,
      store: false,
      max_output_tokens: outputTokens,
      ...(/^gpt-[56]|^o[134]/.test(model)
        ? {
            reasoning: {
              effort:
                ["pm", "designer", "manager"].includes(agent.role) &&
                /^gpt-5\.[2-9]|^gpt-6/.test(model)
                  ? "none"
                  : "low",
            },
          }
        : {}),
    }),
    signal: AbortSignal.timeout(150000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "The model API key was rejected. Update the connection in Settings."
        : response.status === 429
          ? "The model is rate-limited or out of credit. Check the account and retry."
          : `The model request failed (${response.status}). No deliverable was committed; you can retry.`,
    );
  const data = (await response.json()) as any;
  const usage = {
    inputTokens: Number(data.usage?.input_tokens) || inputTokens,
    outputTokens: Number(data.usage?.output_tokens) || 0,
    reasoningTokens:
      Number(data.usage?.output_tokens_details?.reasoning_tokens) || 0,
    model,
  };
  const usedTokens =
    Number(data.usage?.total_tokens) || usage.inputTokens + usage.outputTokens;
  try {
    if (data.status === "incomplete")
      throw new Error(
        `The ${agent.title} exceeded its ${outputTokens.toLocaleString()}-token output allowance. Completed files are saved. Send a note to narrow this task, then retry. This attempt’s tokens are included in usage.`,
      );
    const text = data.output
      ?.flatMap((o: any) => o.content || [])
      .filter((c: any) => c.type === "output_text")
      .map((c: any) => c.text)
      .join("");
    if (!text)
      throw new Error(
        "The model returned no usable work. Retry or revise the brief.",
      );
    const raw = JSON.parse(text);
    const validation = resultSchema.safeParse(
      agent.role === "manager"
        ? {
            summary: raw.summary,
            artifacts: [
              {
                name: "delivery-notes.md",
                type: "markdown",
                content: raw.notes,
              },
            ],
            edits: [],
            request_changes: null,
          }
        : raw,
    );
    if (!validation.success)
      throw new Error(
        "The teammate returned an invalid artifact format. No files were replaced. Retry the step; this attempt’s tokens are included in usage.",
      );
    const parsed = validation.data;
    if (agent.role === "qa") {
      parsed.artifacts = parsed.artifacts.map((a) => ({
        ...a,
        name: "qa-review.md",
      }));
    }
    if (
      agent.role === "frontend" &&
      !parsed.artifacts.some(
        (a) => a.type === "html" && /\.html?$/i.test(a.name),
      ) &&
      parsed.edits.length === 0
    )
      throw new Error(
        "The frontend teammate did not produce a playable HTML file. Retry this step.",
      );
    if (
      ["qa", "manager"].includes(agent.role) &&
      parsed.artifacts.some((a) => a.type === "html")
    )
      throw new Error(
        "The reviewer returned app source instead of a concise review. No replacement app was saved. Retry the review.",
      );
    const artifacts = [...parsed.artifacts];
    if (parsed.edits.length) {
      if (agent.role !== "frontend")
        throw new Error(
          "Only the frontend teammate can edit application files.",
        );
      const current = new Map(
        latestArtifacts(mission).map((a) => [a.name, { ...a }]),
      );
      const changed = new Set<string>();
      for (const edit of parsed.edits) {
        const file = current.get(edit.name);
        if (!file || !isPlayableArtifact(file))
          throw new Error(
            "The requested edit does not target an existing app file.",
          );
        if (artifacts.some((a) => a.name === edit.name))
          throw new Error("Return edits or a replacement file, not both.");
        const first = file.content.indexOf(edit.find);
        if (first < 0 || file.content.indexOf(edit.find, first + 1) >= 0)
          throw new Error(
            "An edit did not match exactly once. The original app is preserved; retry this revision.",
          );
        file.content =
          file.content.slice(0, first) +
          edit.replace +
          file.content.slice(first + edit.find.length);
        changed.add(edit.name);
      }
      for (const name of changed) {
        const file = current.get(name)!;
        artifacts.push({
          name: file.name,
          type: file.type,
          content: file.content,
        });
      }
    }
    return { ...parsed, artifacts, tokens: usedTokens, usage };
  } catch (error) {
    if (error && typeof error === "object")
      Object.assign(error, { usedTokens, usage });
    throw error;
  }
}
export async function step(
  ownerId: string,
  missionId: string,
  keyOverride?: string,
  modelOverride?: string,
) {
  let claimed: Mission | undefined;
  let teammate: Agent | undefined;
  const lease = crypto.randomUUID();
  const key = keyOverride || (env as any).OPENAI_API_KEY;
  const model = modelOverride || (env as any).OPENAI_MODEL || "gpt-5.2";
  await mutate(ownerId, (ws) => {
    const m = ws.missions.find((m) => m.id === missionId);
    if (!m) throw new Error("Mission not found.");
    if (m.status !== "running") throw new Error("Mission is not running.");
    if (m.leaseUntil && m.leaseUntil > Date.now())
      throw new Error("A teammate is already working.");
    if (m.mode === "live" && !key)
      throw new Error(
        "Connect a model in Settings before starting a live mission.",
      );
    if (m.step >= m.tasks.length)
      throw new Error("There are no remaining tasks.");
    m.lease = lease;
    m.leaseUntil = Date.now() + 180000;
    m.tasks[m.step].status = "working";
    teammate = ws.agents.find(
      (a) => a.teamId === m.teamId && a.role === m.tasks[m.step].role,
    );
    if (!teammate)
      throw new Error("This mission needs a teammate for the current role.");
    event(
      m,
      teammate.name,
      "started",
      `${m.mode === "demo" ? "Demo: " : ""}${m.tasks[m.step].title}. Reading shared memory and the latest team messages.`,
    );
    claimed = structuredClone(m);
  });
  try {
    const m = claimed!,
      a = teammate!;
    let result;
    if (m.mode === "demo") {
      await new Promise((r) => setTimeout(r, 2300));
      const d = demoResult(a.role);
      result = {
        summary: d.summary,
        artifacts: [{ name: d.name, type: d.type, content: d.content }],
        request_changes: null,
        tokens: 0,
      };
    } else result = await execute(a, m, key, model);
    return await mutate(ownerId, (ws) => {
      const current = ws.missions.find((v) => v.id === missionId)!;
      if (current.lease !== lease)
        throw new Error("The run changed while this teammate was working.");
      delete current.lease;
      delete current.leaseUntil;
      delete current.budgetRequiredTotal;
      current.tokens += result.tokens;
      current.tasks[current.step].status = "done";
      current.tasks[current.step].summary = result.summary;
      event(current, a.name, "handoff", result.summary, result.tokens);
      if ("usage" in result)
        Object.assign(current.events[current.events.length - 1], result.usage);
      for (const art of result.artifacts) {
        current.artifacts.push({
          ...art,
          id: crypto.randomUUID(),
          agent: a.name,
        });
        event(
          current,
          a.name,
          "artifact",
          `Wrote ${art.name} to shared memory.`,
        );
      }
      if (a.role === "qa" && result.request_changes) {
        const reworkCount = current.tasks.filter((t) =>
          t.title.startsWith("Revise"),
        ).length;
        if (reworkCount >= 2) {
          current.status = "failed";
          event(
            current,
            a.name,
            "error",
            "Review still has blockers after two revision rounds. Please revise the brief.",
          );
          return;
        }
        const front = ws.agents.find(
          (v) => v.teamId === current.teamId && v.role === "frontend",
        );
        if (front) {
          current.tasks.splice(
            current.step + 1,
            0,
            {
              id: crypto.randomUUID(),
              role: "frontend",
              title: "Revise: " + result.request_changes.slice(0, 180),
              status: "queued",
            },
            {
              id: crypto.randomUUID(),
              role: "qa",
              title: "Review the revision",
              status: "queued",
            },
          );
          event(current, a.name, "review", result.request_changes);
        }
      }
      current.step++;
      if (current.step >= current.tasks.length) {
        current.status = "review";
        event(
          current,
          "Hearth",
          "review",
          "The team has finished. Review the deliverables and launch when ready.",
        );
      } else if (current.tokens >= current.maxTokens) {
        current.status = "paused";
        event(
          current,
          "Hearth",
          "budget",
          "Token budget reached. Work is saved.",
        );
      }
    });
  } catch (error) {
    await mutate(ownerId, (ws) => {
      const m = ws.missions.find((v) => v.id === missionId);
      if (m?.lease === lease) {
        delete m.lease;
        delete m.leaseUntil;
        m.status = error instanceof BudgetPause ? "paused" : "failed";
        if (error instanceof BudgetPause)
          m.budgetRequiredTotal = error.requiredTotal;
        m.tokens += Number((error as any)?.usedTokens) || 0;
        m.tasks[m.step].status =
          error instanceof BudgetPause ? "queued" : "blocked";
        event(
          m,
          "Hearth",
          error instanceof BudgetPause ? "budget" : "error",
          error instanceof Error
            ? error.message
            : "The teammate could not finish. Retry this step.",
          Number((error as any)?.usedTokens) || undefined,
        );
        if ((error as any)?.usage)
          Object.assign(m.events[m.events.length - 1], (error as any).usage);
      }
    });
    throw error;
  }
}
