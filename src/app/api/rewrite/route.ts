import { aiAvailable, aiRewrite } from "@/lib/ai";
import { runRuleChecks } from "@/lib/engine/text";
import { bad, parseBrand, parseContext, rateLimited } from "@/lib/server";

export const maxDuration = 60;

/** AI rewrite of a whole draft, followed by a self-check with the deterministic rules. */
export async function POST(req: Request) {
  if (rateLimited(req, 15)) return bad("Too many requests, please wait a minute.", 429);
  if (!aiAvailable()) return bad("AI layer is offline", 503);
  const body = await req.json().catch(() => null);
  const ctx = parseContext(body);
  const brand = parseBrand(body?.brand);
  const text = typeof body?.text === "string" ? body.text : "";
  const issues = Array.isArray(body?.issues) ? body.issues.map(String).slice(0, 30) : [];
  if (!ctx || !brand || !text || text.length > 8000) return bad("Invalid request");
  try {
    const today = typeof body?.today === "string" ? body.today.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const rewrite = await aiRewrite(text, ctx, brand, issues, today);
    const remaining = runRuleChecks({ id: "rw", label: "Rewrite", text: rewrite }, { brand, ...ctx, today });
    return Response.json({ rewrite, remaining });
  } catch (e) {
    console.error("rewrite failed", e);
    return bad("The AI rewrite failed. Rule-based fixes still work.", 502);
  }
}
