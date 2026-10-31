import { aiAvailable, aiModelName, aiReview } from "@/lib/ai";
import { runRuleChecks } from "@/lib/engine/text";
import { resolveSource } from "@/lib/knowledge";
import { bad, parseBrand, parseContext, parseSegments, rateLimited } from "@/lib/server";
import type { CheckMeta, Finding } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (rateLimited(req)) return bad("Too many checks, please wait a minute.", 429);
  const body = await req.json().catch(() => null);
  const segments = parseSegments(body?.segments);
  const ctx = parseContext(body);
  const brand = parseBrand(body?.brand);
  if (!segments || !ctx || !brand) return bad("Invalid request");
  const useAI = body?.useAI !== false;
  const today = typeof body?.today === "string" ? body.today.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const t0 = Date.now();
  // Layer A: deterministic rules first.
  const ruleFindings: Finding[] = segments.flatMap((s) => runRuleChecks(s, { brand, ...ctx, today }));

  // Layer B: the model, only for what rules can't judge. Failure never blocks the result.
  const meta: CheckMeta = { aiStatus: "offline", aiProposed: 0, aiRejected: 0, ms: 0, guidelineVersion: brand.version };
  let aiFindings: Finding[] = [];
  if (useAI && aiAvailable()) {
    try {
      const r = await aiReview(segments, ctx, brand, ruleFindings, today);
      aiFindings = r.findings;
      for (const f of ruleFindings) {
        if (r.fixes[f.id]) {
          f.suggestion = r.fixes[f.id];
          f.suggestionBy = "ai";
        }
      }
      meta.aiStatus = "ok";
      meta.aiModel = aiModelName();
      meta.aiProposed = r.proposed;
      meta.aiRejected = r.rejected;
    } catch (e) {
      console.error("AI review failed:", e);
      meta.aiStatus = "error";
      const m = e instanceof Error ? e.message : String(e);
      meta.aiError = /timeout|aborted/i.test(m) ? "timed out" : /(429|503)/.test(m) ? "provider busy" : /JSON|Unexpected/i.test(m) ? "unreadable response" : m.slice(0, 80);
    }
  }
  meta.ms = Date.now() - t0;
  const order = { high: 0, medium: 1, low: 2 };
  // Last line of defence: every citation must resolve to a real record in this guideline version.
  const all = [...ruleFindings, ...aiFindings];
  const cited = all.filter((f) => resolveSource(brand, f.source) && (!f.evidence || resolveSource(brand, f.evidence)));
  meta.aiRejected += all.length - cited.length;
  const findings = cited.sort(
    (a, b) => a.segmentId.localeCompare(b.segmentId) || order[a.severity] - order[b.severity] || (a.start ?? 0) - (b.start ?? 0),
  );
  return Response.json({ findings, meta, context: ctx });
}
