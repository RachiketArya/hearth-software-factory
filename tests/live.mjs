// Opt-in live test: requires OPENAI_API_KEY in the process environment. Never writes the key.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error("Set OPENAI_API_KEY to run this opt-in live test.");
const output = path.resolve(
  process.env.HEARTH_LIVE_OUTPUT || "outputs/live-snake",
);
fs.mkdirSync(output, { recursive: true });
let ws;
function compile(name, overrides = {}) {
  const source = fs.readFileSync(
    new URL("../lib/" + name + ".ts", import.meta.url),
    "utf8",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
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
          async mutate(_owner, fn) {
            const draft = structuredClone(ws);
            fn(draft);
            ws = draft;
            fs.writeFileSync(
              path.join(output, "workspace.json"),
              JSON.stringify(ws, null, 2),
            );
            return { workspace: ws, revision: 0 };
          },
        };
      return {};
    },
    fetch: async (url, options) => {
      const r = await fetch(url, options);
      if (url.endsWith("/responses")) {
        const d = await r.clone().json();
        fs.appendFileSync(
          path.join(output, "provider-results.jsonl"),
          JSON.stringify({
            status: d.status,
            incomplete_details: d.incomplete_details,
            usage: d.usage,
            output: d.output,
          }) + "\n",
        );
      }
      return r;
    },
    Error,
    AbortSignal,
    crypto,
    structuredClone,
    setTimeout,
    console,
    ...overrides,
  };
  vm.runInNewContext(js, scope);
  return scope.exports;
}
const domain = compile("domain");
const initial = domain.initialWorkspace();
const fixture = process.env.HEARTH_LIVE_FIXTURE;
const mission = fixture
  ? JSON.parse(fs.readFileSync(fixture, "utf8"))
  : domain.makeMission(
      initial.teams[0].id,
      "build a snakes game",
      "live",
      initial.agents,
    );
if (process.env.HEARTH_LIVE_BUDGET)
  mission.maxTokens = Number(process.env.HEARTH_LIVE_BUDGET);
initial.agents.forEach((a) => (a.teamId = mission.teamId));
initial.teams[0].id = mission.teamId;
mission.status = "running";
delete mission.lease;
delete mission.leaseUntil;
ws = { ...initial, missions: [mission] };
const runner = compile("runner");
const before = mission.tokens;
while (ws.missions[0].status === "running") {
  const m = ws.missions[0];
  const role = m.tasks[m.step].role;
  const started = Date.now();
  console.log("Starting", role, "at", m.tokens, "/", m.maxTokens, "tokens");
  try {
    await runner.step(
      "live-test",
      m.id,
      key,
      process.env.OPENAI_MODEL || "gpt-5.2",
    );
  } catch (e) {
    console.log("Stopped:", e.message);
    break;
  }
  console.log(
    "Finished",
    role,
    "in",
    Math.round((Date.now() - started) / 1000) + "s; total",
    ws.missions[0].tokens,
  );
}
const result = ws.missions[0];
fs.writeFileSync(
  path.join(output, "mission.json"),
  JSON.stringify(result, null, 2),
);
const artifact = result.artifacts.filter(domain.isPlayableArtifact).at(-1);
if (artifact)
  fs.writeFileSync(path.join(output, "index.html"), artifact.content);
console.log(
  JSON.stringify(
    {
      status: result.status,
      steps: result.step,
      totalTokens: result.tokens,
      newTokens: result.tokens - before,
      requiredBudget: result.budgetRequiredTotal,
      output,
    },
    null,
    2,
  ),
);
if (result.status !== "review" && result.status !== "complete")
  process.exitCode = 1;
