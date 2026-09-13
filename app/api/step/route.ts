import { step } from "@/lib/runner";
import { owner, checkOrigin } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const body = (await req.json()) as { id?: string; model?: string };
    if (typeof body.id !== "string" || body.id.length > 100)
      throw new Error("Mission ID required.");
    if (body.model && !/^[a-zA-Z0-9._-]{1,80}$/.test(body.model))
      throw new Error("Invalid model name.");
    return Response.json(
      await step(
        owner(req),
        body.id,
        req.headers.get("x-model-key") || undefined,
        body.model,
      ),
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
