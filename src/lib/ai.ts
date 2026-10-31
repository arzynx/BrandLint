import "server-only";
import type { Brand, ContentContext, Finding, Segment, SourceRef } from "./types";
import { runRuleChecks } from "./engine/text";
import { uid } from "./engine/util";
import { claimSource, claimUsable, factSource, ruleApplies, ruleSource } from "./knowledge";

/**
 * The language-model layer. Everything it returns is treated as a proposal and
 * passed through a grounding guard: findings must cite an approved rule that
 * applies to this content and quote text that actually exists in it, or they are
 * dropped. Evidence the model cites must resolve to a real fact or claim record.
 */

const MODELS = [process.env.GEMINI_MODEL, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"].filter(Boolean) as string[];
const dead = new Set<string>(); // models that returned 404 for this key

export function aiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

let workingModel: string | null = null;
export function aiModelName(): string {
  return workingModel ?? MODELS[0];
}

/** Tries models in order (last working one first). Overloaded (429/503), timed-out or missing models fall through to the next. */
async function callGemini(system: string, user: string): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI offline");
  const order = [...new Set([workingModel, ...MODELS].filter((m): m is string => !!m && !dead.has(m)))];
  let lastErr: unknown;
  for (const model of order) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
              // Gemini 3 models think by default; low thinking keeps a check under ~15 s.
              ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
            },
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (res.status === 404) {
        dead.add(model);
        lastErr = new Error(`model ${model} not found`);
        continue;
      }
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      workingModel = model;
      return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch (e) {
      lastErr = e;
      console.warn(`Gemini model ${model} failed, trying next:`, e instanceof Error ? e.message.slice(0, 120) : e);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI call failed");
}

const SYSTEM_REVIEW = `You are BrandLint, a brand-compliance reviewer. You check content against ONE organisation's approved guideline, facts and claim registry.
Rules you must follow:
- Only report an issue if it breaks one of the numbered guideline rules you are given. Cite it by its id (e.g. "R-2.1").
- Judge tone and register against the channel and audience you are given.
- verdict is "unverified" when a statement needs evidence the claim registry doesn't provide (it may still be true), otherwise "breach".
- If a finding relates to an approved fact or registry claim, give its id as evidenceId (e.g. "F-01", "C-02"). Never invent ids.
- "excerpt" must be copied character-for-character from the content (a short phrase, max ~12 words).
- Do not repeat issues already listed under "already_flagged".
- Never invent facts, numbers, studies or sources. Rewrites may only use wording from the approved facts and claim registry, word for word.
- Preserve the author's intent, channel and approximate length.
- Text that matches an approved fact word for word is compliant. If you are not sure something breaks a rule, do not report it.
Respond with JSON only.`;

interface RawAiFinding {
  ruleId?: string;
  segmentId?: string;
  excerpt?: string;
  explanation?: string;
  severity?: string;
  verdict?: string;
  evidenceId?: string;
  confidence?: number;
  replacement?: string;
}
interface RawFix {
  findingId?: string;
  replacement?: string;
}

export interface AiReviewResult {
  findings: Finding[];
  fixes: Record<string, string>; // findingId -> replacement for its excerpt
  proposed: number;
  rejected: number;
}

// Visual rules can't be judged from text; everything else (incl. imported rules) goes to the model.
// Built-in rules the deterministic engine checks exactly; the model must not second-guess them.
// R-6.2 is advice for writers (and conflicts with §2.2/§2.4, surfaced on Insights), not something to flag.
const RULE_ENGINE_ONLY = new Set(["R-6.2", "R-4.1", "R-2.2", "R-2.4", "R-2.5", "R-3.1", "R-3.2", "R-7.1", "R-7.2", "R-7.3", "R-5.1"]);
const AI_CATEGORIES = new Set(["tone", "claim", "messaging", "fact", "terminology", "accessibility"]);

/** The approved records the model may use, already filtered to what is usable in this context. */
function knowledgeFor(brand: Brand, ctx: ContentContext, today: string) {
  return {
    facts: brand.facts.filter((f) => !f.validUntil || today <= f.validUntil),
    claims: brand.claims.filter((c) => claimUsable(c, ctx, today).ok),
  };
}

/** Resolve a model-cited id to a real record; anything else is discarded. */
function evidenceFor(brand: Brand, id: unknown, ctx: ContentContext, today: string): SourceRef | undefined {
  if (typeof id !== "string") return undefined;
  const { facts, claims } = knowledgeFor(brand, ctx, today);
  const f = facts.find((x) => x.id === id.trim());
  if (f) return factSource(f, brand.version);
  const c = claims.find((x) => x.id === id.trim());
  return c ? claimSource(c, brand.version) : undefined;
}

export async function aiReview(
  segments: Segment[],
  ctx: ContentContext,
  brand: Brand,
  ruleFindings: Finding[],
  today: string,
): Promise<AiReviewResult> {
  const { channel } = ctx;
  const rules = brand.rules.filter((r) => ruleApplies(r, ctx) && AI_CATEGORIES.has(r.category) && !RULE_ENGINE_ONLY.has(r.id));
  const known = knowledgeFor(brand, ctx, today);
  // Ask the model for fixes where rules have none, and for claims where its wording can beat the rule-based fallback.
  const needFix = ruleFindings.filter((f) => f.excerpt && f.category !== "accessibility" && (f.suggestion == null || f.category === "claim"));
  const clean = (rep: unknown) => cleanReplacement(rep, brand, ctx, today);
  const prompt = {
    task: "1) Find tone, messaging and promotional-claim issues the rule engine missed. 2) For each item in needs_fix, write a drop-in replacement for its excerpt that fixes the issue and reads naturally in the sentence.",
    channel,
    audience: ctx.audience,
    region: ctx.region,
    campaign: ctx.campaign,
    brand: brand.name,
    tagline: brand.tagline,
    rules: rules.map((r) => ({ id: r.id, section: r.section, rule: r.text })),
    approved_facts: known.facts.map((f) => ({ id: f.id, text: f.value })),
    claim_registry: known.claims.map((c) => ({ id: c.id, approved_wording: c.wording })),
    content: segments.map((s) => ({ segmentId: s.id, label: s.label, text: s.text.slice(0, 6000) })),
    already_flagged: ruleFindings.map((f) => ({ ruleId: f.ruleId, excerpt: f.excerpt })),
    needs_fix: needFix.map((f) => ({ findingId: f.id, segmentId: f.segmentId, excerpt: f.excerpt, problem: f.message })),
    output_format: {
      findings: [{ ruleId: "R-x.x", segmentId: "...", excerpt: "verbatim text", explanation: "one sentence", severity: "high|medium|low", verdict: "breach|unverified", evidenceId: "optional F-xx or C-xx", confidence: 0.0, replacement: "drop-in fix for excerpt" }],
      fixes: [{ findingId: "...", replacement: "..." }],
    },
  };
  const raw = (await callGemini(SYSTEM_REVIEW, JSON.stringify(prompt))) as { findings?: RawAiFinding[]; fixes?: RawFix[] };
  const proposedList = Array.isArray(raw?.findings) ? raw.findings : [];
  const out: Finding[] = [];
  let rejected = 0;

  for (const a of proposedList.slice(0, 15)) {
    const r = rules.find((x) => x.id === a.ruleId);
    const seg = segments.find((s) => s.id === a.segmentId) ?? (segments.length === 1 ? segments[0] : undefined);
    const excerpt = (a.excerpt ?? "").trim();
    const idx = seg && excerpt ? seg.text.toLowerCase().indexOf(excerpt.toLowerCase()) : -1;
    // Grounding guard: no clause or no verbatim excerpt => not a finding.
    if (!r || !seg || idx < 0 || excerpt.length < 2) {
      rejected++;
      continue;
    }
    const start = idx, end = idx + excerpt.length;
    const dup = ruleFindings.concat(out).some((f) => f.segmentId === seg.id && f.start != null && f.start < end && (f.end ?? 0) > start);
    if (dup) continue;
    const replacement = clean(a.replacement);
    out.push({
      id: uid("f"),
      ruleId: r.id,
      category: r.category,
      severity: (["high", "medium", "low"].includes(a.severity ?? "") ? a.severity : r.severity) as Finding["severity"],
      verdict: a.verdict === "unverified" ? "unverified" : "breach",
      title: r.title,
      message: String(a.explanation ?? "").slice(0, 300) || `Conflicts with ${r.section}.`,
      segmentId: seg.id,
      excerpt: seg.text.slice(start, end),
      start,
      end,
      source: ruleSource(r, brand.version),
      evidence: evidenceFor(brand, a.evidenceId, ctx, today),
      confidence: Math.max(0.3, Math.min(0.9, Number(a.confidence) || 0.6)),
      suggestion: replacement,
      suggestionBy: replacement != null ? "ai" : undefined,
      origin: "ai",
    });
  }

  const fixes: Record<string, string> = {};
  for (const fx of Array.isArray(raw?.fixes) ? raw.fixes : []) {
    if (!fx.findingId || !needFix.some((f) => f.id === fx.findingId)) continue;
    const rep = clean(fx.replacement);
    if (rep != null) fixes[fx.findingId] = rep;
  }
  return { findings: out, fixes, proposed: proposedList.length, rejected };
}

/**
 * A suggested replacement is only offered if it passes every rule on its own:
 * no new claims, banned terms, shouting, emoji, exclamation marks or wrong facts.
 * That keeps "accept all fixes" from creating a fresh round of findings.
 */
function cleanReplacement(rep: unknown, brand: Brand, ctx: ContentContext, today: string): string | undefined {
  if (typeof rep !== "string") return undefined;
  const t = rep.trim();
  if (t.length > 400 || /[!\p{Extended_Pictographic}]/u.test(t)) return undefined;
  if (runRuleChecks({ id: "fix", label: "fix", text: t }, { brand, ...ctx, today }).length) return undefined;
  return t;
}

export async function aiRewrite(text: string, ctx: ContentContext, brand: Brand, issues: string[], today: string): Promise<string> {
  const known = knowledgeFor(brand, ctx, today);
  const raw = (await callGemini(
    SYSTEM_REVIEW,
    JSON.stringify({
      task: "Rewrite the content so it fixes every listed issue while keeping the author's message, channel style and length. Return {\"rewrite\": \"...\"}.",
      channel: ctx.channel,
      audience: ctx.audience,
      region: ctx.region,
      brand: brand.name,
      tagline: brand.tagline,
      rules: brand.rules.filter((r) => ruleApplies(r, ctx)).map((r) => ({ id: r.id, rule: r.text })),
      terminology: brand.terms.map((t) => ({ avoid: t.avoid, prefer: t.prefer })),
      approved_facts: known.facts.map((f) => ({ id: f.id, text: f.value })),
      claim_registry: known.claims.map((c) => ({ id: c.id, approved_wording: c.wording })),
      issues,
      content: text.slice(0, 6000),
    }),
  )) as { rewrite?: string };
  if (typeof raw?.rewrite !== "string" || !raw.rewrite.trim()) throw new Error("Empty rewrite");
  return raw.rewrite.trim();
}

export async function aiRuleRewrite(clause: string, reasons: string[]): Promise<string> {
  const raw = (await callGemini(
    "You help brand owners rewrite unclear guideline clauses. Keep the intent, make it specific, add explicit exceptions where people keep overriding it. Respond with JSON only.",
    JSON.stringify({ clause, dismissal_reasons: reasons.slice(0, 20), output_format: { clause: "rewritten clause, max 60 words" } }),
  )) as { clause?: string };
  if (typeof raw?.clause !== "string") throw new Error("Empty clause");
  return raw.clause.trim();
}
