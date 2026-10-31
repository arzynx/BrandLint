import type { Category, Rule, Severity } from "./types";

export interface Candidate {
  section: string;
  text: string;
  category: Category;
  severity: Severity;
  title: string;
}

const NORMATIVE = /\b(must|never|always|do not|don't|avoid|only|should not|shouldn't|required|not allowed|prohibited|at most|no more than|use)\b/i;

function categorise(t: string): Category {
  const s = t.toLowerCase();
  if (/(claim|superlative|proven|guarantee|clinical|#1|best|evidence|substantiat|disclos|#ad|influencer)/.test(s)) return "claim";
  if (/(colou?r|palette|logo|font|typeface|image|photo|visual|clear space)/.test(s)) return "visual";
  if (/(alt text|contrast|accessib|screen reader|caption|wcag)/.test(s)) return "accessibility";
  if (/(price|number|statistic|date|offer|discount|fact)/.test(s)) return "fact";
  if (/(tagline|brand name|spell|capitali|trademark)/.test(s)) return "messaging";
  if (/(word|term|say|call|refer to)/.test(s)) return "terminology";
  return "tone";
}

/**
 * Heuristic clause extraction: normative sentences ("must", "never", "avoid"…)
 * become candidate rules the brand owner confirms one by one. Nothing is added
 * without a human ticking it.
 */
export function extractCandidates(raw: string): Candidate[] {
  const out: Candidate[] = [];
  let section = "";
  const lines = raw.replace(/\r/g, "").split(/\n+/);
  for (const line of lines) {
    const head = line.match(/^\s*(?:§\s*)?(\d+(?:\.\d+)*)[.)]?\s+/);
    if (head) section = head[1];
    const body = line.replace(/^\s*(?:§\s*)?\d+(?:\.\d+)*[.)]?\s+/, "").replace(/^[-•*]\s*/, "").trim();
    for (const sentence of body.split(/(?<=[.!?])\s+(?=[A-Z"“])/)) {
      const t = sentence.trim();
      if (t.length < 20 || t.length > 400 || !NORMATIVE.test(t)) continue;
      if (out.some((c) => c.text === t)) continue;
      const category = categorise(t);
      out.push({
        section: section ? `§${section}` : "§imported",
        text: t,
        category,
        severity: /\b(must|never|prohibited|not allowed|required)\b/i.test(t) || category === "claim" ? "high" : "medium",
        title: t.replace(/[.!?]+$/, "").split(/[,:;]/)[0].slice(0, 60),
      });
    }
  }
  return out.slice(0, 60);
}

/**
 * A confirmed candidate. Confirming it in the import review is the owner's approval,
 * so it is enforced immediately; the source document and approver are recorded.
 */
export function candidateToRule(
  c: Candidate,
  n: number,
  meta: { source?: string; owner?: string; version?: number } = {},
): Rule {
  return {
    id: `R-imp-${n}`,
    section: c.section,
    title: c.title,
    text: c.text,
    category: c.category,
    severity: c.severity,
    enabled: true,
    status: "approved",
    source: meta.source ?? "Imported guideline",
    owner: meta.owner ?? "Brand owner",
    updatedInVersion: meta.version,
  };
}
