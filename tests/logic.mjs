import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const html = fs.readFileSync(
  new URL("../lib/pinball.html", import.meta.url),
  "utf8",
);
const nodes = new Map();
function element(id) {
  if (!nodes.has(id))
    nodes.set(id, {
      textContent: "",
      onclick: null,
      addEventListener() {},
      focus() {},
      setPointerCapture() {},
      getContext() {
        return {};
      },
    });
  return nodes.get(id);
}
const game = vm.createContext({
  document: { querySelector: element },
  window: { addEventListener() {} },
  requestAnimationFrame() {},
  Math,
});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], game);
vm.runInContext("launch();", game);
assert.equal(vm.runInContext("playing", game), true);
vm.runInContext(
  "ball.x=153;ball.y=150;ball.vx=0;ball.vy=100;update(1/180)",
  game,
);
assert.equal(vm.runInContext("score", game), 100);
vm.runInContext(
  "for(let i=0;i<3;i++){playing=true;ball.y=620;update(1/180)}",
  game,
);
assert.equal(vm.runInContext("lives", game), 0);
vm.runInContext("launch()", game);
assert.equal(vm.runInContext("playing", game), false);
element("#restart").onclick();
assert.equal(vm.runInContext("score", game), 0);
assert.equal(vm.runInContext("lives", game), 3);
vm.runInContext(
  "keys.left=true;ball={x:160,y:496,vx:0,vy:200,r:8};playing=true;update(1/180)",
  game,
);
assert(vm.runInContext("ball.vy", game) < 0);
vm.runInContext("launch();for(let i=0;i<15000;i++)update(1/180)", game);
assert(
  vm.runInContext("Number.isFinite(ball.x)&&Number.isFinite(ball.y)", game),
);
const js = ts.transpileModule(
  fs.readFileSync(new URL("../lib/runner.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
let reply = {
  status: "completed",
  output: [
    {
      content: [
        {
          type: "output_text",
          text: JSON.stringify({
            summary: "Built the app.",
            artifacts: [
              {
                name: "index.html",
                type: "html",
                content: "<!doctype html><h1>Working app</h1>",
              },
            ],
            request_changes: null,
          }),
        },
      ],
    },
  ],
  usage: { total_tokens: 120 },
};
let captured;
const runner = {
  exports: {},
  require(name) {
    if (name === "zod") return require("zod");
    if (name === "./domain")
      return {
        isPlayableArtifact: (a) =>
          a.type === "html" && /\.html?$/i.test(a.name),
      };
    if (name === "cloudflare:workers") return { env: {} };
    return {};
  },
  fetch: async (url, options) => {
    if (url.endsWith("/input_tokens"))
      return { ok: true, json: async () => ({ input_tokens: 100 }) };
    assert.equal(url, "https://api.openai.com/v1/responses");
    captured = JSON.parse(options.body);
    return { ok: true, json: async () => reply };
  },
  AbortSignal,
  Math,
  JSON,
  Number,
  Date,
  crypto,
  Error,
};
vm.runInNewContext(js, runner);
const agent = {
  name: "Finn",
  title: "Frontend engineer",
  role: "frontend",
  instructions: "Write a self-contained browser app.",
};
const mission = {
  prompt: "Build a calculator",
  tasks: [{ title: "Build the app" }],
  step: 0,
  artifacts: [],
  events: [],
  maxTokens: 60000,
  tokens: 0,
};
const result = await runner.exports.execute(
  agent,
  mission,
  "test-key",
  "test-model",
);
assert.equal(result.tokens, 120);
assert.equal(result.artifacts[0].name, "index.html");
assert.equal(captured.store, false);
assert.equal(captured.text.format.type, "json_schema");
assert.equal(captured.model, "test-model");
reply = { ...reply, status: "incomplete" };
await assert.rejects(
  () => runner.exports.execute(agent, mission, "test-key", "test-model"),
  /output allowance/,
);
reply = { status: "completed", output: [] };
await assert.rejects(
  () => runner.exports.execute(agent, mission, "test-key", "test-model"),
  /no usable work/,
);
await assert.rejects(
  () =>
    runner.exports.execute(
      agent,
      { ...mission, tokens: 59999 },
      "test-key",
      "test-model",
    ),
  /Increase this mission/,
);
const duplicated = {
  ...mission,
  artifacts: [
    { id: "old", name: "index.html", type: "html", content: "OLD" },
    { id: "new", name: "index.html", type: "html", content: "NEW" },
    {
      id: "core",
      name: "snake-core.js",
      type: "markdown",
      content: "DUPLICATE CORE",
    },
  ],
};
duplicated.artifacts.push({
  id: "review",
  name: "qa-review.md",
  type: "markdown",
  content: "STALE FINDINGS",
});
duplicated.events = [
  { kind: "review", actor: "QA", text: "STALE REVIEW" },
  { kind: "message", actor: "Human", text: "USER REQUIREMENT" },
];
duplicated.artifacts.push({
  id: "bad-review",
  name: "index.html",
  type: "markdown",
  content: "MISNAMED REVIEW",
});
assert.equal(
  runner.exports
    .latestArtifacts(duplicated)
    .find((a) => a.name === "index.html").content,
  "NEW",
);
const qa = runner.exports.modelPayload(
  { ...agent, role: "qa" },
  duplicated,
  "test-model",
);
assert(qa.input.includes("NEW"));
assert(!qa.input.includes("OLD"));
assert(!qa.input.includes("DUPLICATE CORE"));
assert(!qa.input.includes("STALE"));
assert(qa.input.includes("USER REQUIREMENT"));
const delivery = runner.exports.modelPayload(
  { ...agent, role: "manager" },
  duplicated,
  "test-model",
);
assert(!delivery.input.includes('"content":"NEW"'));
assert(delivery.text.format.schema.properties.notes);
assert(!delivery.text.format.schema.properties.artifacts);
const backend = runner.exports.modelPayload(
  { ...agent, role: "backend" },
  mission,
  "test-model",
);
assert(
  !backend.text.format.schema.properties.artifacts.items.properties.type.enum.includes(
    "html",
  ),
);
assert.deepEqual(
  Array.from(
    qa.text.format.schema.properties.artifacts.items.properties.type.enum,
  ),
  ["markdown"],
);
reply = {
  status: "completed",
  output: [
    {
      content: [
        {
          type: "output_text",
          text: JSON.stringify({
            summary: "Looks good.",
            artifacts: [],
            request_changes: null,
          }),
        },
      ],
    },
  ],
  usage: { total_tokens: 120 },
};
const measuredMission = {
  ...mission,
  artifacts: [{ name: "large.md", content: "x".repeat(30000) }],
  tokens: 40000,
  maxTokens: 55000,
};
await runner.exports
  .execute(agent, measuredMission, "test-key", "test-model")
  .catch((e) => {
    if (!e.message.includes("playable")) throw e;
  });
console.log(
  "PASS: pinball bumper scoring, flipper impulse, three-life game over, restart, finite physics; live Responses payload, validated artifact output, usage accounting, refusal/incomplete response handling, budget guard. Live provider is mocked; no real model call was made.",
);
const editable = {
  ...mission,
  tasks: [{ title: "Revise the app" }],
  artifacts: [
    {
      id: "app",
      name: "index.html",
      type: "html",
      content: "<h1>Snake</h1><p>broken</p>",
    },
  ],
};
reply = {
  status: "completed",
  output: [
    {
      content: [
        {
          type: "output_text",
          text: JSON.stringify({
            summary: "Fixed the app.",
            artifacts: [],
            edits: [
              {
                name: "index.html",
                find: "<p>broken</p>",
                replace: "<p>fixed</p>",
              },
            ],
            request_changes: null,
          }),
        },
      ],
    },
  ],
  usage: { total_tokens: 120 },
};
const patched = await runner.exports.execute(
  agent,
  editable,
  "test-key",
  "test-model",
);
assert.equal(patched.artifacts[0].content, "<h1>Snake</h1><p>fixed</p>");
assert.equal(editable.artifacts[0].content, "<h1>Snake</h1><p>broken</p>");
assert.equal(captured.max_output_tokens, 4000);
await assert.rejects(
  () =>
    runner.exports.execute(
      agent,
      {
        ...editable,
        artifacts: [
          { ...editable.artifacts[0], content: "<p>broken</p><p>broken</p>" },
        ],
      },
      "test-key",
      "test-model",
    ),
  (e) => e.message.includes("exactly once") && e.usedTokens === 120,
);
reply = {
  status: "completed",
  output: [
    {
      content: [
        {
          type: "output_text",
          text: JSON.stringify({
            summary: "Wrong filename.",
            artifacts: [
              { name: "src/core.js", type: "markdown", content: "code" },
            ],
            edits: [],
            request_changes: null,
          }),
        },
      ],
    },
  ],
  usage: { total_tokens: 120 },
};
await assert.rejects(
  () => runner.exports.execute(agent, mission, "test-key", "test-model"),
  (e) => e.message.includes("invalid artifact") && e.usedTokens === 120,
);
console.log(
  "PASS: targeted edits preserve original versions, ambiguous edits fail atomically, revision output is bounded, and invalid-output token usage is retained.",
);

reply = {
  status: "completed",
  output: [
    {
      content: [
        {
          type: "output_text",
          text: JSON.stringify({
            summary: "Reviewed",
            artifacts: [
              { name: "index.html", type: "markdown", content: "No blockers" },
            ],
            request_changes: null,
          }),
        },
      ],
    },
  ],
  usage: { total_tokens: 120 },
};
const reviewResult = await runner.exports.execute(
  { ...agent, role: "qa" },
  mission,
  "test-key",
  "test-model",
);
assert.equal(reviewResult.artifacts[0].name, "qa-review.md");
console.log(
  "PASS: review notes cannot replace a playable app, including legacy misnamed files.",
);
