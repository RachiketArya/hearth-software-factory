import { env } from "cloudflare:workers";
import { Mission } from "./domain";
export const STUDIO_REPO = "fabianchua6/chatjipiti-game";
export const STUDIO_URL = "https://chatjipiti-game.rachiketarya.chatgpt.site";
export function studioEnabled(owner: string) {
  return (
    !!(env as any).STUDIO_RUNNER_SECRET &&
    (env as any).STUDIO_OWNER_ID === owner
  );
}
export function attachStudio(m: Mission) {
  m.repository = {
    repo: STUDIO_REPO,
    siteUrl: STUDIO_URL,
    phase: "queued",
    checks: [],
  };
  const order = ["pm", "designer", "backend", "frontend", "qa", "manager"];
  m.tasks.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  for (const task of m.tasks)
    task.title = {
      pm: "Read studio context and define the game",
      designer: "Design within the studio",
      backend: "Implement game rules and tests",
      frontend: "Integrate the playable game",
      qa: "Execute tests, build, and browser checks",
      manager: "Release the tested commit",
    }[task.role];
}
