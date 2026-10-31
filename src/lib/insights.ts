import { runRuleChecks } from "./engine/text";
import { routeOf } from "./governance";
import { staleKnowledge } from "./knowledge";
import type { Brand, Channel, Route, Rule, Submission, Verdict } from "./types";

export interface RuleStat {
  key: string;
  title: string;
  ref: string;
  clause: string;
  occurrences: number;
  fixed: number; // accepted or edited
  dismissed: number;
  open: number;
  dismissRate: number;
  reasons: [string, number][];
  reviewed: number; // creator dismissals a reviewer ruled on
  reinstated: number; // ... and overturned
  disputeRate: number;
}

export const GAP_MIN_OCCURRENCES = 4;
export const GAP_MIN_DISMISS_RATE = 0.4;
export const DISPUTE_MIN_REINSTATED = 2;
export const DISPUTE_MIN_RATE = 0.3;

export function computeInsights(subs: Submission[], brand: Brand, today = new Date().toISOString().slice(0, 10)) {
  const rules = new Map<string, RuleStat>();
  const byTeam = new Map<string, number>();
  const byChannel = new Map<string, number>();
  const weekly = new Map<string, number>();
  const byVerdict: Record<Verdict, number> = { breach: 0, contradicts: 0, unverified: 0 };
  const byRoute: Record<Route, number> = { blocker: 0, escalate: 0, review: 0, advisory: 0 };
  let firstPassClean = 0;
  let totalFindings = 0;

  for (const s of subs) {
    const first = s.revisions[0];
    if (!first.findings.some((f) => f.severity === "high")) firstPassClean++;
    // Count each issue once per submission: use the first revision's findings and the latest decision available.
    for (const f of first.findings) {
      totalFindings++;
      byVerdict[f.verdict ?? "breach"]++;
      byRoute[routeOf(f)]++;
      const key = f.ruleId ?? f.title;
      const decision = [...s.revisions].reverse().map((r) => r.decisions[f.id]).find(Boolean) ?? first.decisions[f.id];
      const rule = brand.rules.find((r) => r.id === key);
      const term = brand.terms.find((t) => t.id === key);
      const st =
        rules.get(key) ??
        ({
          key,
          title: rule?.title ?? (term ? `Terminology: "${term.avoid[0]}" → "${term.prefer}"` : f.title),
          ref: f.source.ref,
          clause: rule?.text ?? f.source.quote,
          occurrences: 0,
          fixed: 0,
          dismissed: 0,
          open: 0,
          dismissRate: 0,
          reasons: [],
          reviewed: 0,
          reinstated: 0,
          disputeRate: 0,
        } as RuleStat);
      st.occurrences++;
      if (!decision) st.open++;
      else if (decision.action === "dismissed" || decision.action === "overridden") {
        st.dismissed++;
        const reason = (decision.reason ?? "").replace(/ \(carried over.*\)$/, "");
        const hit = st.reasons.find((r) => r[0] === reason);
        if (hit) hit[1]++;
        else st.reasons.push([reason, 1]);
        if (decision.review) {
          st.reviewed++;
          if (decision.review.outcome === "reinstated") st.reinstated++;
        }
      } else st.fixed++;
      rules.set(key, st);
      byTeam.set(s.team, (byTeam.get(s.team) ?? 0) + 1);
      byChannel.set(s.channel, (byChannel.get(s.channel) ?? 0) + 1);
    }
    const monday = new Date(s.createdAt);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const wk = monday.toISOString().slice(0, 10);
    weekly.set(wk, (weekly.get(wk) ?? 0) + first.findings.length);
  }

  const stats = [...rules.values()].map((r) => ({
    ...r,
    dismissRate: r.fixed + r.dismissed ? r.dismissed / (r.fixed + r.dismissed) : 0,
    disputeRate: r.reviewed ? r.reinstated / r.reviewed : 0,
    reasons: r.reasons.sort((a, b) => b[1] - a[1]),
  }));
  const sortDesc = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

  return {
    submissions: subs.length,
    totalFindings,
    firstPassCleanRate: subs.length ? firstPassClean / subs.length : 0,
    topBroken: [...stats].sort((a, b) => b.fixed - a.fixed).filter((s) => s.fixed > 0).slice(0, 5),
    /** Rules people keep overriding: the clause is probably too broad or unclear. */
    gaps: stats
      .filter((s) => s.occurrences >= GAP_MIN_OCCURRENCES && s.dismissRate >= GAP_MIN_DISMISS_RATE)
      .sort((a, b) => b.dismissRate - a.dismissRate),
    /** Rules where creators and reviewers read the clause differently. */
    disputes: stats
      .filter((s) => s.reinstated >= DISPUTE_MIN_REINSTATED && s.disputeRate >= DISPUTE_MIN_RATE)
      .sort((a, b) => b.disputeRate - a.disputeRate),
    conflicts: findConflicts(brand, today),
    stale: staleKnowledge(brand, today),
    byVerdict,
    byRoute,
    allRules: stats.sort((a, b) => b.occurrences - a.occurrences),
    byTeam: sortDesc(byTeam),
    byChannel: sortDesc(byChannel),
    weekly: [...weekly.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}

// ---------- guideline conflicts ----------

export interface Conflict {
  kind: "contradiction" | "duplicate";
  a: { id: string; ref: string };
  b: { id: string; ref: string };
  example?: string;
  detail: string;
}

const NEGATIVE = /\b(?:never|not|avoid|no|don't|do\s+not|instead\s+of)\b/i;
const POSITIVE = /\b(?:use|e\.g|such\s+as|like|write|say|for\s+example)\b/i;

/**
 * Quoted phrases a clause recommends: 'Use "brightening"', 'e.g. "Obsessed!!"'.
 * Quotes after "never" / "avoid" are examples of what not to do, and are skipped.
 */
export function recommendedExamples(text: string): string[] {
  const out: string[] = [];
  let prevEnd = 0;
  let prevPolarity: "pos" | "neg" | null = null;
  for (const m of text.matchAll(/"([^"]{2,80})"/g)) {
    const gap = text.slice(prevEnd, m.index).replace(/\be\.g\.|\bi\.e\./gi, "e.g");
    const sentenceGap = gap.split(/[.;:]\s/).pop() ?? gap;
    let polarity: "pos" | "neg" | null;
    if (prevPolarity && /^\s*(?:,|or|and|\/)\s*(?:or\s+)?$/i.test(gap)) polarity = prevPolarity;
    else if (NEGATIVE.test(sentenceGap)) polarity = "neg";
    else if (POSITIVE.test(sentenceGap)) polarity = "pos";
    else polarity = null;
    if (polarity === "pos") out.push(m[1]);
    prevPolarity = polarity;
    prevEnd = m.index! + m[0].length;
  }
  return out;
}

function words(t: string) {
  return new Set(t.toLowerCase().match(/[a-z]{3,}/g) ?? []);
}

function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

/**
 * Deterministic guideline health checks:
 * - a clause's own recommended example (or the tagline, or approved wording) breaks another rule
 * - two approved rules say nearly the same thing
 */
export function findConflicts(brand: Brand, today = new Date().toISOString().slice(0, 10)): Conflict[] {
  const out: Conflict[] = [];
  const approved = brand.rules.filter((r) => r.enabled && r.status === "approved");
  const channelFor = (r?: Rule): Channel => r?.scope?.channels?.[0] ?? "instagram";
  const ref = (r: Rule) => ({ id: r.id, ref: `Guideline ${r.section}` });

  const probe = (text: string, owner: { id: string; ref: string }, channel: Channel) => {
    const found = runRuleChecks({ id: "probe", label: "probe", text }, { brand, channel, today });
    for (const f of found) {
      if (!f.ruleId || f.ruleId === owner.id) continue;
      if (out.some((c) => c.a.id === owner.id && c.b.id === f.ruleId && c.example === text)) continue;
      out.push({
        kind: "contradiction",
        a: owner,
        b: { id: f.ruleId, ref: f.source.ref },
        example: text,
        detail: `${owner.ref} recommends "${text}", but ${f.source.ref} flags it: ${f.message}`,
      });
    }
  };

  for (const r of approved) for (const ex of recommendedExamples(r.text)) probe(ex, ref(r), channelFor(r));
  probe(brand.tagline, { id: "tagline", ref: "Approved tagline" }, "website");
  for (const t of brand.terms) probe(t.prefer, { id: t.id, ref: `Terminology ${t.id}` }, "website");
  for (const c of brand.claims.filter((x) => x.status === "verified")) probe(c.wording, { id: c.id, ref: `Claim Registry ${c.id}` }, "website");

  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const a = approved[i], b = approved[j];
      if (a.category !== b.category) continue;
      const sim = jaccard(words(a.text), words(b.text));
      if (sim >= 0.6)
        out.push({
          kind: "duplicate",
          a: ref(a),
          b: ref(b),
          detail: `${a.section} and ${b.section} say nearly the same thing (${Math.round(sim * 100)}% word overlap). Keep one so findings cite a single source.`,
        });
    }
  }
  return out;
}
