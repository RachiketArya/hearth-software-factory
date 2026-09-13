import pinball from "./pinball.html?raw";
import type { Role } from "./domain";
export function demoResult(role: Role) {
  const data: Record<
    Role,
    {
      summary: string;
      name: string;
      content: string;
      type: "html" | "markdown";
    }
  > = {
    pm: {
      summary:
        "The pinball brief is ready: a browser game, three balls, flippers, bumpers, scoring, and touch controls. Passing acceptance criteria to Luna.",
      name: "product-brief.md",
      type: "markdown",
      content:
        "# Midnight pinball — product brief\n\nDemonstration artifact, prepared in advance.\n\n## Success criteria\n- Play without installation.\n- Left/right arrows or A/D move two flippers.\n- Space or Launch puts a ball into play.\n- Each bumper hit scores 100.\n- Three lost balls end the game.\n- Restart resets score and lives.\n- Touch controls work with pointer capture.\n\n## Scope\nOne local player, pseudo-3D cabinet, no account or leaderboard.",
    },
    designer: {
      summary:
        "A midnight-blue cabinet, mint bumpers, and lavender flippers. The table gets perspective and raised edges. Controls remain clear on small screens.",
      name: "design-spec.md",
      type: "markdown",
      content:
        "# Design direction\n\nDemonstration artifact, prepared in advance.\n\nMidnight blue #10142b, mint #65c6b3, lavender #9b7cc5.\n\nUse a perspective-transformed canvas inside a raised cabinet. Make the score immediately visible. Keep flipper controls below the table for touch devices. Honor reduced motion by removing the perspective transform.\n\nMaintain high contrast, focus outlines, and text instructions.",
    },
    backend: {
      summary:
        "Core logic uses a fixed 180 Hz step, circle-to-segment collisions, bumper impulses, and velocity limits. The score and three-ball lifecycle stay in one state.",
      name: "physics-notes.md",
      type: "markdown",
      content:
        "# Core implementation\n\nDemonstration artifact, prepared in advance.\n\nPhysics: fixed 1/180 second steps, gravity 460px/s², collision separation with normal reflection. Limit velocity to 1100px/s. Bumpers award 100 points. Active flippers apply an upward impulse.\n\nState: score, lives, playing, ball position/velocity, left/right key state.\n\nReset the accumulator delta after a background pause. Release controls on blur and pointer cancellation.",
    },
    frontend: {
      summary:
        "The playable game is ready. It includes the cabinet, physics, keyboard and touch controls, scoring, restart, and three lives. Handing the source to Iris.",
      name: "index.html",
      type: "html",
      content: pinball,
    },
    qa: {
      summary:
        "The demo includes a source-review checklist. Browser execution is not performed by this teammate in demo mode. Please play-test the preview before launch.",
      name: "qa-review.md",
      type: "markdown",
      content:
        "# QA review checklist\n\nThis is a scripted demonstration, not an autonomous test result.\n\n## Manual checks\n- Launch using button and Space.\n- Hold each flipper and release it.\n- Confirm bumper contact increments score by 100.\n- Drain three balls and confirm game over.\n- Restart and confirm score 0, lives 3.\n- Try touch controls and keyboard focus.\n\n## Implementation notes\nThe source includes frame-delta clamping, speed limits, pointer capture, and blur cleanup.\n\n## Limitations\nPseudo-3D rendering, approximate flipper impulses, no audio, no remote leaderboard.",
    },
    manager: {
      summary:
        "All six demonstration stages are complete. The playable artifact and supporting notes are ready for your review. Launch creates a private workspace link.",
      name: "delivery-notes.md",
      type: "markdown",
      content:
        "# Ready for review\n\nThis mission is a scripted walkthrough. The app was prepared in advance, and no model tokens were used.\n\nOpen index.html in the sandboxed preview. When you are satisfied, launch it to give the game a stable private link inside this workspace.\n\nLive mode generates deliverables from your own prompt using the configured model.",
    },
  };
  return { ...data[role], handoff: null };
}
