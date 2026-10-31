import { demoBrand } from "./brand/demo";
import { ruleSource } from "./knowledge";
import type { Channel, Decision, Finding, Submission, Verdict } from "./types";

/**
 * Sample history for the Insights page. It is generated, clearly labelled as
 * sample data in the UI, and can be hidden. It exists so a first-time visitor
 * can see what governance insights look like after a few weeks of use.
 */

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

interface Pattern {
  ruleId: string;
  excerpt: string;
  message: string;
  dismissRate: number;
  reinstateRate?: number; // share of reviewed dismissals a reviewer overturned
  verdict?: Verdict;
  reasons: string[];
  weight: number;
  termRow?: number;
}

const PATTERNS: Pattern[] = [
  { ruleId: "R-2.2", excerpt: "!", message: "3 exclamation marks; the limit is one.", dismissRate: 0.7, weight: 9, reasons: ["Festive post, excitement is on-brand here", "Instagram audience expects energy", "Launch day post", "Exclamation is in a customer quote"] },
  { ruleId: "R-2.5", excerpt: "✨", message: "5 emoji found; instagram allows 3.", dismissRate: 0.6, reinstateRate: 0.1, weight: 7, reasons: ["Diwali post, emoji are part of the festive look", "Reel caption, 3 is too few", "Emoji used as bullet points"] },
  { ruleId: "T-01", excerpt: "remove", message: '"remove" is on the avoid list.', dismissRate: 0.75, reinstateRate: 0.55, weight: 6, termRow: 1, reasons: ['"Remove makeup" is literal, not a claim', "Talking about removing the cap, not skin", 'Cleanser copy: "removes dirt" is accurate'] },
  { ruleId: "R-4.2", excerpt: "#1", message: '"#1" is a ranking claim. There is no verified entry in the Claim Registry to support it.', verdict: "unverified", dismissRate: 0.05, reinstateRate: 1, weight: 6, reasons: ["Quoting a customer review"] },
  { ruleId: "R-4.3", excerpt: "clinically proven", message: '"clinically proven" is a clinical claim. There is no verified entry in the Claim Registry to support it.', verdict: "unverified", dismissRate: 0.05, reinstateRate: 1, weight: 5, reasons: ["Legal confirmed verbally"] },
  { ruleId: "R-4.1", excerpt: "₹699", message: "Price ₹699 doesn't match the approved price of ₹799 (F-01).", verdict: "contradicts", dismissRate: 0, weight: 5, reasons: [] },
  { ruleId: "R-3.1", excerpt: "Glow beyond limits", message: '"Glow beyond limits" is a retired tagline.', dismissRate: 0.1, weight: 4, reasons: ["Reusing an old creative for a throwback post"] },
  { ruleId: "R-7.1", excerpt: "#skinexplained", message: "Hashtag is hard for screen readers.", dismissRate: 0.1, weight: 5, reasons: ["Hashtag is case-sensitive in a campaign tracker"] },
  { ruleId: "R-4.2", excerpt: "5 lakh+", message: '"5 lakh+" is higher than the verified figure in the Claim Registry (2 lakh+, C-01).', verdict: "unverified", dismissRate: 0.1, reinstateRate: 1, weight: 3, reasons: ["Includes marketplace buyers"] },
  { ruleId: "R-6.1", excerpt: "use my code", message: "Discount code without #ad or #collab.", dismissRate: 0, weight: 3, reasons: [] },
  { ruleId: "R-3.2", excerpt: "Lumera Skincare", message: 'Brand name written as "Lumera Skincare".', dismissRate: 0, weight: 3, reasons: [] },
  { ruleId: "R-5.1", excerpt: "", message: "#C2185B covers 22% of the image.", dismissRate: 0.3, weight: 3, reasons: ["Partner brand colours in a co-branded post"] },
  { ruleId: "R-7.3", excerpt: "", message: "Contrast 2.8:1; normal text needs 4.5:1.", dismissRate: 0.15, weight: 3, reasons: ["Decorative text, not information"] },
];

const TEAMS = ["Social", "Performance", "Agency: Kite Studio", "Founders' office", "Retail"];
const CHANNELS: Channel[] = ["instagram", "instagram", "instagram", "website", "email", "print"];
const AUTHORS = ["Priya", "Karan", "Meera", "Kite Studio", "Aditya", "Sana"];
const TITLES = ["Diwali offer post", "Glow Serum launch reel", "Sunscreen myth-buster", "Newsletter: festive picks", "Store standee", "Barrier cream carousel", "Customer story", "Website hero banner", "Influencer brief", "Flyer for pop-up"];

export function seedHistory(now = new Date("2026-10-27T12:00:00Z")): Submission[] {
  const r = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const totalWeight = PATTERNS.reduce((s, p) => s + p.weight, 0);
  const pickPattern = () => {
    let x = r() * totalWeight;
    for (const p of PATTERNS) if ((x -= p.weight) <= 0) return p;
    return PATTERNS[0];
  };
  const out: Submission[] = [];
  for (let i = 0; i < 42; i++) {
    const created = new Date(now.getTime() - (35 - (i * 35) / 42) * 86400000 - r() * 3600000 * 8);
    const channel = pick(CHANNELS);
    const team = pick(TEAMS);
    const author = team.startsWith("Agency") ? "Kite Studio" : pick(AUTHORS);
    const n = 1 + Math.floor(r() * 4);
    const findings: Finding[] = [];
    const decisions: Record<string, Decision> = {};
    for (let k = 0; k < n; k++) {
      const p = pickPattern();
      const rule = demoBrand.rules.find((x) => x.id === p.ruleId);
      const term = p.termRow ? demoBrand.terms[p.termRow - 1] : undefined;
      const id = `seed_${i}_${k}`;
      findings.push({
        id,
        ruleId: p.ruleId,
        category: rule?.category ?? "terminology",
        severity: rule?.severity ?? term?.severity ?? "low",
        verdict: p.verdict ?? "breach",
        title: rule?.title ?? `Use "${term?.prefer}"`,
        message: p.message,
        segmentId: "s1",
        excerpt: p.excerpt || undefined,
        source: rule
          ? ruleSource(rule, demoBrand.version)
          : { kind: "term", id: term?.id, version: demoBrand.version, ref: `Terminology sheet, row ${p.termRow} (${term?.id})`, quote: `Avoid: ${term?.avoid.join(", ")} → Prefer: ${term?.prefer}` },
        confidence: 0.85,
        origin: p.ruleId === "R-5.1" || p.ruleId === "R-7.3" ? "vision" : "rule",
      });
      const dismissed = r() < p.dismissRate;
      const reviewed = dismissed && r() < 0.8;
      decisions[id] = {
        action: dismissed ? "dismissed" : r() < 0.8 ? "accepted" : "edited",
        reason: dismissed ? pick(p.reasons) : undefined,
        by: author,
        role: "creator",
        at: created.toISOString(),
        review: reviewed
          ? {
              outcome: r() < (p.reinstateRate ?? 0.2) ? "reinstated" : "upheld",
              by: "Rahul",
              role: "reviewer",
              at: new Date(created.getTime() + 3600000 * 5).toISOString(),
            }
          : undefined,
      };
    }
    const at = created.toISOString();
    out.push({
      id: `sample_${i}`,
      title: pick(TITLES),
      channel,
      team,
      author,
      format: r() < 0.6 ? "text" : r() < 0.5 ? "image" : "pdf",
      status: r() < 0.85 ? "approved" : "changes_requested",
      revisions: [
        {
          n: 1,
          segments: [{ id: "s1", label: "Text", text: "(sample history: content not stored)" }],
          findings,
          decisions,
          meta: { aiStatus: "offline", aiProposed: 0, aiRejected: 0, ms: 0, guidelineVersion: demoBrand.version },
          createdAt: at,
          by: author,
        },
      ],
      comments: [],
      createdAt: at,
      updatedAt: at,
      sample: true,
    });
  }
  return out;
}
