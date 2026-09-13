import assert from "node:assert/strict";
const base = process.env.HEARTH_TEST_URL || "http://localhost:5173";
const owner = "integration-" + Date.now();
async function req(path = "/api/workspace", body, extra = {}) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "oai-authenticated-user-id": owner,
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  return { status: r.status, data };
}
const first = await req();
assert.equal(first.status, 200);
assert.equal(first.data.workspace.agents.length, 6);
const team = first.data.workspace.teams[0];
assert.equal(
  (
    await req("/api/workspace", {
      action: "team",
      name: "",
      template: "engineering",
    })
  ).status,
  400,
);
assert(
  [400, 403].includes(
    (
      await req(
        "/api/workspace",
        { action: "team", name: "Blocked", template: "lean" },
        { origin: "https://foreign.example" },
      )
    ).status,
  ),
);
const lean = await req("/api/workspace", {
  action: "team",
  name: "Small team",
  template: "lean",
});
assert.equal(lean.data.workspace.teams.length, 2);
const second = lean.data.workspace.teams[1];
assert.equal(
  lean.data.workspace.agents.filter((a) => a.teamId === second.id).length,
  3,
);
const a = lean.data.workspace.agents[0];
await req("/api/workspace", {
  action: "agent",
  id: a.id,
  name: "Maya edited",
  instructions: a.instructions + " Use concise acceptance criteria.",
});
assert.equal((await req()).data.workspace.agents[0].name, "Maya edited");
const created = await req("/api/workspace", {
  action: "mission",
  teamId: team.id,
  prompt: "Build a pinball game",
  mode: "demo",
});
const id = created.data.workspace.missions[0].id;
assert.equal(
  (await req("/api/workspace", { action: "control", id, command: "launch" }))
    .status,
  400,
);
await req("/api/workspace", { action: "control", id, command: "start" });
const inFlight = req("/api/step", { id });
await new Promise((r) => setTimeout(r, 250));
const collision = await req("/api/step", { id });
assert.equal(collision.status, 400);
assert.match(collision.data.error, /already working/);
await req("/api/workspace", { action: "control", id, command: "pause" });
await req("/api/workspace", {
  action: "message",
  id,
  text: "Please preserve keyboard controls.",
});
const finished = await inFlight;
assert.equal(finished.status, 200);
let m = finished.data.workspace.missions.find((m) => m.id === id);
assert.equal(m.step, 1);
assert.equal(m.status, "paused");
const budgetUpdate = await req("/api/workspace", {
  action: "budget",
  id,
  maxTokens: 70000,
});
assert.equal(budgetUpdate.status, 200);
assert.equal(
  budgetUpdate.data.workspace.missions.find((v) => v.id === id).maxTokens,
  70000,
);
assert.equal(
  budgetUpdate.data.workspace.missions.find((v) => v.id === id).step,
  1,
);
assert.equal(
  (await req("/api/workspace", { action: "budget", id, maxTokens: 999999 }))
    .status,
  400,
);

assert(m.events.some((e) => e.text.includes("preserve keyboard")));
assert.equal((await req("/api/step", { id })).status, 400);
await req("/api/workspace", { action: "control", id, command: "resume" });
for (let i = 1; i < 6; i++) {
  const r = await req("/api/step", { id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  m = r.data.workspace.missions.find((m) => m.id === id);
}
assert.equal(m.status, "review");
assert.equal(m.artifacts.length, 6);
assert.equal(m.tokens, 0);
assert(m.artifacts.some((a) => a.name === "index.html"));
assert(m.tasks.every((t) => t.status === "done"));
const launched = await req("/api/workspace", {
  action: "control",
  id,
  command: "launch",
});
assert.equal(
  launched.data.workspace.missions.find((m) => m.id === id).status,
  "complete",
);
const play = await fetch(base + "/play/" + id, {
  headers: { "oai-authenticated-user-id": owner },
});
assert.equal(play.status, 200);
const html = await play.text();
assert(html.includes('sandbox="allow-scripts"'));
assert(html.includes("Content-Security-Policy"));
const collaboration = await req("/api/workspace", {
  action: "collaborate",
  id,
  teamId: second.id,
  brief: "Review this app and improve its touch controls.",
});
const child = collaboration.data.workspace.missions[0];
assert.equal(child.parentMissionId, id);
assert.equal(child.artifacts.length, 6);
await req("/api/workspace", {
  action: "control",
  id: child.id,
  command: "start",
});
for (let i = 0; i < 3; i++)
  assert.equal((await req("/api/step", { id: child.id })).status, 200);
const returned = await req("/api/workspace", {
  action: "control",
  id: child.id,
  command: "return",
});
assert.equal(returned.status, 200);
assert.equal(
  returned.data.workspace.missions.find((m) => m.id === id).artifacts.length,
  9,
);
const again = await req("/api/workspace", {
  action: "control",
  id: child.id,
  command: "return",
});
assert.equal(
  again.data.workspace.missions.find((m) => m.id === id).artifacts.length,
  9,
);
const live = await req("/api/workspace", {
  action: "mission",
  teamId: team.id,
  prompt: "Build a working calculator",
  mode: "live",
});
const liveId = live.data.workspace.missions[0].id;
await req("/api/workspace", {
  action: "control",
  id: liveId,
  command: "start",
});
const noKey = await req("/api/step", { id: liveId });
assert.equal(noKey.status, 400);
assert.match(noKey.data.error, /Connect a model/);
const isolated = await fetch(base + "/api/workspace", {
  headers: { "oai-authenticated-user-id": owner + "-other" },
});
const isolatedData = await isolated.json();
assert.equal(isolatedData.workspace.missions.length, 0);
console.log(
  "PASS: persistence, validation, owner isolation, origin checks, templates, agent edits, mission controls, concurrent lease, pause mid-step, messages, six-role delivery, sandboxed launch, cross-team context, idempotent return, and missing-model behavior.",
);
