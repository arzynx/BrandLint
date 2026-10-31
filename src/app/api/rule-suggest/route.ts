import { aiAvailable, aiRuleRewrite } from "@/lib/ai";
import { bad, rateLimited } from "@/lib/server";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (rateLimited(req, 10)) return bad("Too many requests", 429);
  if (!aiAvailable()) return bad("AI layer is offline", 503);
  const body = await req.json().catch(() => null);
  const clause = typeof body?.clause === "string" ? body.clause.slice(0, 1000) : "";
  const reasons = Array.isArray(body?.reasons) ? body.reasons.map((r: unknown) => String(r).slice(0, 200)) : [];
  if (!clause) return bad("Invalid request");
  try {
    return Response.json({ clause: await aiRuleRewrite(clause, reasons) });
  } catch (e) {
    console.error(e);
    return bad("AI suggestion failed", 502);
  }
}
