import { claimUsable, context } from "../knowledge";
import type { Brand, Claim, ContentContext } from "../types";
import { findAll, sentenceAt, type Match } from "./util";

export interface ClaimPattern {
  ruleId: string;
  label: string;
  re: RegExp;
}

/**
 * Curated lexicon of regulated promotional claim patterns, grouped by the
 * guideline rule they fall under. Hand-written; see /eval for measured accuracy.
 */
export const CLAIM_PATTERNS: ClaimPattern[] = [
  // §4.2 superlatives and rankings
  { ruleId: "R-4.2", label: "ranking claim", re: /(?<![\w])(?:#\s?1|no\.?\s?1|number\s+one)(?![\w])/gi },
  { ruleId: "R-4.2", label: "superlative", re: /\b(?:best(?:-selling)?|leading|unbeatable|unmatched)\b/gi },
  { ruleId: "R-4.2", label: "superlative", re: /\bfastest[-\s]growing\b/gi },
  { ruleId: "R-4.2", label: "superlative", re: /\btop[-\s]rated\b/gi },
  { ruleId: "R-4.2", label: "superlative", re: /\bmost\s+(?:trusted|loved|effective|popular|advanced)\b/gi },
  { ruleId: "R-4.2", label: "first-of-its-kind claim", re: /\b(?:world|india)'?s\s+first\b/gi },
  // §4.3 efficacy
  { ruleId: "R-4.3", label: "clinical claim", re: /\b(?:clinically|scientifically|medically)\s+(?:proven|tested|backed|approved)\b/gi },
  { ruleId: "R-4.3", label: "endorsement claim", re: /\b(?:dermatologists?|doctors?|experts?)[-\s](?:recommended|approved|backed|endorsed)\b/gi },
  { ruleId: "R-4.3", label: "time-bound result", re: /\b(?:in|within)\s+(?:just\s+|only\s+)?\d+\s+(?:days?|hours?|weeks?|nights?|minutes?)\b/gi },
  { ruleId: "R-4.3", label: "time-bound result", re: /\b(?:visible|guaranteed)\s+results?\b/gi },
  { ruleId: "R-4.3", label: "duration claim", re: /\b\d+[-\s]hours?\s+(?:hydration|moisture|protection|wear)\b|\bup\s+to\s+\d+\s+hours\b/gi },
  // §4.4 absolutes
  { ruleId: "R-4.4", label: "absolute promise", re: /\bguarantee[ds]?\b/gi },
  { ruleId: "R-4.4", label: "absolute promise", re: /\b100\s?%(?!\s*(?:off|cashback))/gi },
  { ruleId: "R-4.4", label: "absolute promise", re: /\bpermanent(?:ly)?\b/gi },
  { ruleId: "R-4.4", label: "medical claim", re: /\bcures?\b|\bheals?\s+(?:acne|eczema|psoriasis)\b/gi },
  { ruleId: "R-4.4", label: "absolute promise", re: /\bno\s+side[-\s]effects?\b/gi },
  { ruleId: "R-4.4", label: "absolute promise", re: /\b(?:miracle|magic(?:al)?)\b/gi },
  { ruleId: "R-4.4", label: "absolute promise", re: /\binstant(?:ly)?\b|\bovernight\s+results?\b/gi },
  // §4.5 fairness
  { ruleId: "R-4.5", label: "fairness language", re: /\bfairness\b|\bfair(?:er)?\s+(?:skin|complexion|tone)\b/gi },
  { ruleId: "R-4.5", label: "fairness language", re: /\b(?:skin\s+)?(?:whitening|lightening|bleaching)\b/gi },
];

export interface ClaimHit extends Match {
  ruleId: string;
  label: string;
  supportedBy?: Claim; // the registry entry whose wording contains this claim (it may still be unusable here)
}

/** The registry claim whose substantiated phrase contains this hit, in the same sentence. */
function supportingClaim(text: string, hit: Match, brand: Brand): Claim | undefined {
  const s = sentenceAt(text, hit.start);
  const lower = s.text.toLowerCase();
  for (const f of brand.claims) {
    for (const phrase of f.supports) {
      let from = 0;
      let idx: number;
      while ((idx = lower.indexOf(phrase.toLowerCase(), from)) !== -1) {
        const a = s.start + idx;
        const b = a + phrase.length;
        if (hit.start >= a && hit.end <= b) return f;
        from = idx + 1;
      }
    }
  }
  return undefined;
}

export function detectClaims(text: string, brand: Brand): ClaimHit[] {
  const hits: ClaimHit[] = [];
  for (const p of CLAIM_PATTERNS) {
    for (const m of findAll(text, p.re)) {
      // skip overlaps with an earlier, longer hit
      if (hits.some((h) => m.start < h.end && m.end > h.start)) continue;
      hits.push({ ...m, ruleId: p.ruleId, label: p.label, supportedBy: supportingClaim(text, m, brand) });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** Sentence-level classifier used by the evaluation page: does this sentence contain an unsupported claim? */
export function hasUnsupportedClaim(
  sentence: string,
  brand: Brand,
  ctx: ContentContext = context("website"),
  today = new Date().toISOString().slice(0, 10),
): boolean {
  return detectClaims(sentence, brand).some((h) => !h.supportedBy || !claimUsable(h.supportedBy, ctx, today).ok);
}
