import assert from "node:assert/strict";
const base = process.env.HEARTH_TEST_URL || "http://127.0.0.1:8787";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw Error("Use a local Worker for identity tests.");
const owner = "share-owner-" + Date.now(),
  friend = owner + "-friend",
  viewer = owner + "-viewer",
  outsider = owner + "-outsider";
async function req(
  user,
  path = "/api/workspace",
  body,
  workspace = owner,
  headers = {},
) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "oai-authenticated-user-id": user,
      "x-hearth-workspace": workspace,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { html: text };
  }
  return { status: r.status, data };
}
const profile = await req(owner, "/api/sharing", {
  action: "profile",
  name: "Rachiket",
});
assert.equal(profile.status, 200);
const initial = await req(owner);
assert.equal(initial.status, 200);
assert.equal(initial.data.access.role, "owner");
const team = initial.data.workspace.teams[0];
const created = await req(owner, "/api/workspace", {
  action: "mission",
  teamId: team.id,
  prompt: "Build a pinball game",
  mode: "demo",
});
const mission = created.data.workspace.missions[0];
assert.notEqual((await req(outsider)).status, 200);
assert.notEqual(
  (
    await req(outsider, "/api/workspace", {
      action: "message",
      id: mission.id,
      text: "Intrusion",
    })
  ).status,
  200,
);
const invitation = await req(owner, "/api/sharing", {
  action: "invite",
  label: "Friend",
  role: "collaborator",
});
assert.equal(invitation.status, 200);
const token = new URL(invitation.data.url).hash.slice("#invite=".length);
assert.equal(token.length, 64);
const listing = await req(owner, "/api/sharing");
assert(!JSON.stringify(listing.data).includes(token));
assert(!JSON.stringify(listing.data).includes("token_hash"));
const join = await req(
  friend,
  "/api/sharing",
  { action: "join", token, name: "Sam" },
  friend,
);
assert.equal(join.status, 200);
assert.equal(join.data.workspaceId, owner);
assert.notEqual(
  (
    await req(
      outsider,
      "/api/sharing",
      { action: "join", token, name: "Stranger" },
      outsider,
    )
  ).status,
  200,
);
const shared = await req(friend);
assert.equal(shared.data.workspace.missions[0].id, mission.id);
assert.equal(shared.data.access.role, "collaborator");
assert(shared.data.access.people.some((p) => p.name === "Sam"));
const note = await req(friend, "/api/workspace", {
  action: "message",
  id: mission.id,
  text: "Please keep the controls accessible.",
});
assert.equal(note.status, 200);
assert.equal(note.data.workspace.missions[0].events.at(-1).actor, "Sam");
assert.equal(note.data.workspace.missions[0].events.at(-1).humanId, friend);
assert.equal(
  (await req(owner)).data.workspace.missions[0].events.at(-1).text,
  "Please keep the controls accessible.",
);
for (const body of [
  { action: "budget", id: mission.id, maxTokens: 90000 },
  { action: "control", id: mission.id, command: "start" },
  { action: "team", name: "Not allowed", template: "lean" },
  {
    action: "agent",
    id: initial.data.workspace.agents[0].id,
    name: "x",
    instructions: "Replacement instructions not permitted for collaborators.",
  },
])
  assert.notEqual((await req(friend, "/api/workspace", body)).status, 200);
assert.notEqual(
  (await req(friend, "/api/step", { id: mission.id })).status,
  200,
);
assert.notEqual(
  (
    await req(friend, "/api/sharing", {
      action: "invite",
      label: "Unapproved",
      role: "collaborator",
    })
  ).status,
  200,
);
assert.notEqual(
  (await req(friend, "/api/sharing", { action: "removeMember", id: owner }))
    .status,
  200,
);
await req(owner, "/api/workspace", {
  action: "control",
  id: mission.id,
  command: "start",
});
assert.equal(
  (
    await req(friend, "/api/workspace", {
      action: "control",
      id: mission.id,
      command: "pause",
    })
  ).status,
  200,
);
const vi = await req(owner, "/api/sharing", {
    action: "invite",
    label: "Viewer",
    role: "viewer",
  }),
  vt = new URL(vi.data.url).hash.slice(8);
assert.equal(
  (
    await req(
      viewer,
      "/api/sharing",
      { action: "join", token: vt, name: "Lee" },
      viewer,
    )
  ).status,
  200,
);
assert.equal((await req(viewer)).data.access.role, "viewer");
assert.notEqual(
  (
    await req(viewer, "/api/workspace", {
      action: "message",
      id: mission.id,
      text: "Not allowed",
    })
  ).status,
  200,
);
assert.notEqual(
  (
    await req(viewer, "/api/workspace", {
      action: "control",
      id: mission.id,
      command: "pause",
    })
  ).status,
  200,
);
const revoke = await req(owner, "/api/sharing", {
  action: "removeMember",
  id: friend,
});
assert.equal(revoke.status, 200);
assert.notEqual((await req(friend)).status, 200);
assert.notEqual(
  (
    await req(
      friend,
      "/api/sharing",
      { action: "join", token, name: "Sam" },
      friend,
    )
  ).status,
  200,
);
const ri = await req(owner, "/api/sharing", {
    action: "invite",
    label: "Revoked",
    role: "collaborator",
  }),
  rt = new URL(ri.data.url).hash.slice(8);
const pending = (await req(owner, "/api/sharing")).data.invites.find(
  (i) => i.label === "Revoked",
);
await req(owner, "/api/sharing", { action: "revokeInvite", id: pending.id });
assert.notEqual(
  (
    await req(
      outsider,
      "/api/sharing",
      { action: "join", token: rt, name: "Stranger" },
      outsider,
    )
  ).status,
  200,
);
assert.notEqual(
  (
    await req(
      owner,
      "/api/sharing",
      { action: "invite", label: "CSRF", role: "viewer" },
      owner,
      { origin: "https://evil.example" },
    )
  ).status,
  200,
);
const ci = await req(owner, "/api/sharing", {
    action: "invite",
    label: "Concurrent",
    role: "viewer",
  }),
  ct = new URL(ci.data.url).hash.slice(8);
const race = await Promise.all([
  req(
    friend,
    "/api/sharing",
    { action: "join", token: ct, name: "Sam" },
    friend,
  ),
  req(
    outsider,
    "/api/sharing",
    { action: "join", token: ct, name: "Stranger" },
    outsider,
  ),
]);
assert.equal(race.filter((x) => x.status === 200).length, 1);
// Existing launched URLs remain owner-scoped; explicit shared links require membership.
await req(owner, "/api/workspace", {
  action: "control",
  id: mission.id,
  command: "resume",
});
for (let i = 0; i < 6; i++)
  assert.equal((await req(owner, "/api/step", { id: mission.id })).status, 200);
await req(owner, "/api/workspace", {
  action: "control",
  id: mission.id,
  command: "launch",
});
const play = await req(viewer, "/play/" + mission.id + "?workspace=" + owner);
assert(play.data.html.includes("iframe"));
assert(play.data.html.includes('sandbox="allow-scripts"'));
const denied = await req(
  owner + "-never",
  "/play/" + mission.id + "?workspace=" + owner,
);
assert(!denied.data.html.includes("iframe"));
const personal = await req(viewer, "/api/workspace", undefined, viewer);
assert.equal(personal.data.workspace.missions.length, 0);
console.log(
  "PASS: shared mission visibility, named guidance, presence, collaborator pause, owner-only spending and settings, viewer restrictions, outsider isolation, single-use and concurrent invites, revocation, CSRF, private personal workspaces, and membership-gated launched apps. No model calls.",
);
