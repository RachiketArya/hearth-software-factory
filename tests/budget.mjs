import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let ws = {
  agents: [
    {
      name: "Iris",
      role: "qa",
      teamId: "team",
      title: "QA engineer",
      instructions: "Review the source",
    },
  ],
  missions: [
    {
      id: "mission",
      teamId: "team",
      prompt: "Snake game",
      mode: "live",
      status: "running",
      step: 0,
      tokens: 52000,
      maxTokens: 60000,
      tasks: [
        { id: "qa", role: "qa", title: "Review quality", status: "queued" },
        {
          id: "manager",
          role: "manager",
          title: "Prepare launch",
          status: "queued",
        },
      ],
      events: [],
      artifacts: [
        {
          id: "html",
          type: "html",
          name: "index.html",
          content: "<!doctype html><h1>Snake</h1>",
        },
      ],
    },
  ],
};
let generations = 0;
const scope = {
  exports: {},
  require(n) {
    if (n === "zod") return require(n);
    if (n === "./domain")
      return {
        isPlayableArtifact: (a) =>
          a.type === "html" && /\.html?$/i.test(a.name),
      };
    if (n === "cloudflare:workers") return { env: {} };
    if (n === "./store")
      return {
        async mutate(_, fn) {
          const draft = structuredClone(ws);
          fn(draft);
          ws = draft;
          return { workspace: ws, revision: 1 };
        },
      };
    return {};
  },
  fetch: async (url) => {
    if (url.endsWith("input_tokens"))
      return { ok: true, json: async () => ({ input_tokens: 10000 }) };
    generations++;
    return {
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: "Reviewed.",
                  artifacts: [
                    {
                      name: "qa.md",
                      type: "markdown",
                      content: "No blockers.",
                    },
                  ],
                  request_changes: null,
                }),
              },
            ],
          },
        ],
        usage: { input_tokens: 10000, output_tokens: 500, total_tokens: 10500 },
      }),
    };
  },
  structuredClone,
  crypto,
  AbortSignal,
  setTimeout,
  Error,
};
const js = ts.transpileModule(
  fs.readFileSync(new URL("../lib/runner.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
vm.runInNewContext(js, scope);
await assert.rejects(
  () => scope.exports.step("owner", "mission", "test-key"),
  /Increase this mission/,
);
assert.equal(generations, 0);
assert.equal(ws.missions[0].status, "paused");
assert.equal(ws.missions[0].tokens, 52000);
assert.equal(ws.missions[0].budgetRequiredTotal, 65000);
assert.equal(ws.missions[0].tasks[0].status, "queued");
assert.equal(ws.missions[0].artifacts.length, 1);
assert(!ws.missions[0].lease);
ws.missions[0].maxTokens = 65000;
ws.missions[0].status = "running";
await scope.exports.step("owner", "mission", "test-key");
assert.equal(generations, 1);
assert.equal(ws.missions[0].step, 1);
assert.equal(ws.missions[0].tokens, 62500);
assert.equal(ws.missions[0].artifacts.length, 2);
assert(!ws.missions[0].budgetRequiredTotal);
assert.equal(
  ws.missions[0].events.find((e) => e.kind === "handoff").inputTokens,
  10000,
);
console.log(
  "PASS: measured budget pause makes no generation call, saves all work and usage, clears lease, exposes required allowance, and resumes the exact blocked step after extension.",
);
