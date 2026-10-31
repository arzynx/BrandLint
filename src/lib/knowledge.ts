import type { Brand, Channel, Claim, ContentContext, Fact, Rule, Scope, SourceRef } from "./types";

/**
 * The brand knowledge base: which rules apply where, whether approved
 * information is still current, and whether a citation points at a real record.
 */

export const DEFAULT_CONTEXT: Omit<ContentContext, "channel"> = { audience: "customers", region: "IN" };

export function context(channel: Channel, partial?: Partial<ContentContext>): ContentContext {
  return {
    channel,
    audience: partial?.audience ?? DEFAULT_CONTEXT.audience,
    region: partial?.region?.trim() || DEFAULT_CONTEXT.region,
    campaign: partial?.campaign?.trim() || undefined,
  };
}

export function inScope(scope: Scope | undefined, ctx: ContentContext): boolean {
  if (!scope) return true;
  const ok = <T,>(list: T[] | undefined, v: T | undefined) => !list?.length || (v !== undefined && list.includes(v));
  return (
    ok(scope.channels, ctx.channel) &&
    ok(scope.audiences, ctx.audience) &&
    ok(scope.regions?.map((r) => r.toLowerCase()), ctx.region.toLowerCase()) &&
    ok(scope.campaigns?.map((c) => c.toLowerCase()), ctx.campaign?.toLowerCase())
  );
}

export function describeScope(scope: Scope | undefined): string {
  if (!scope) return "everywhere";
  const parts = [scope.channels, scope.audiences, scope.regions, scope.campaigns].filter((x) => x?.length).map((x) => x!.join(", "));
  return parts.length ? parts.join(" · ") : "everywhere";
}

/** Enforced = approved, switched on, and scoped to this content. */
export function ruleApplies(r: Rule, ctx?: ContentContext): boolean {
  return r.enabled && r.status === "approved" && (!ctx || inScope(r.scope, ctx));
}

export function activeRule(brand: Brand, id: string, ctx?: ContentContext): Rule | undefined {
  const r = brand.rules.find((x) => x.id === id);
  return r && ruleApplies(r, ctx) ? r : undefined;
}

export const REVIEW_SOON_DAYS = 14;

export type Freshness = "current" | "review_soon" | "review_overdue" | "expired" | "pending";

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

/** Whether approved information can still be relied on today. */
export function freshness(item: { validUntil?: string; reviewBy?: string }, today: string): Freshness {
  if (item.validUntil && today > item.validUntil) return "expired";
  if (item.reviewBy && today > item.reviewBy) return "review_overdue";
  const next = [item.validUntil, item.reviewBy].filter(Boolean).sort()[0];
  if (next && daysBetween(today, next) <= REVIEW_SOON_DAYS) return "review_soon";
  return "current";
}

/** A claim can substantiate content only if it's verified, unexpired and allowed in this context. */
export function claimUsable(c: Claim, ctx: ContentContext, today: string): { ok: true } | { ok: false; why: string } {
  if (c.status === "retired") return { ok: false, why: `${c.id} has been retired from the Claim Registry` };
  if (c.status === "pending") return { ok: false, why: `${c.id} is still pending verification` };
  if (c.validUntil && today > c.validUntil) return { ok: false, why: `the evidence for ${c.id} expired on ${c.validUntil}` };
  if (!inScope(c.usage, ctx)) return { ok: false, why: `${c.id} is approved for ${describeScope(c.usage)} only` };
  return { ok: true };
}

/**
 * Does [start, end) in `text` overlap wording that a usable claim substantiates
 * (one of its phrases, or its full approved wording)? Pass only claims usable in context.
 */
export function approvedSpan(text: string, start: number, end: number, usable: Claim[]): boolean {
  const lower = text.toLowerCase();
  for (const c of usable) {
    for (const phrase of [...c.supports, c.wording]) {
      const p = phrase.toLowerCase();
      if (!p) continue;
      for (let i = lower.indexOf(p); i !== -1; i = lower.indexOf(p, i + 1)) {
        if (i < end && i + p.length > start) return true;
      }
    }
  }
  return false;
}

export function ruleSource(r: Rule, version: number): SourceRef {
  return { kind: "rule", id: r.id, ref: `Guideline ${r.section}`, quote: r.text, doc: r.source, version };
}

export function factSource(f: Fact, version: number): SourceRef {
  return { kind: "fact", id: f.id, ref: `Approved Facts ${f.id}`, quote: f.value, doc: `${f.source} · verified ${f.verifiedAt}`, version };
}

export function claimSource(c: Claim, version: number): SourceRef {
  return { kind: "claim", id: c.id, ref: `Claim Registry ${c.id}`, quote: c.wording, doc: `${c.evidence} · ${c.status} ${c.verifiedAt}`, version };
}

/**
 * Does a citation point at a real record in this guideline version, and is the
 * quoted text the record's actual text? Used to reject invented references.
 */
export function resolveSource(brand: Brand, s: SourceRef): boolean {
  if (s.version != null && s.version !== brand.version) return false;
  switch (s.kind) {
    case "rule":
      return brand.rules.some((r) => r.id === s.id && r.text === s.quote);
    case "fact":
      return brand.facts.some((f) => f.id === s.id && f.value === s.quote);
    case "claim":
      return brand.claims.some((c) => c.id === s.id && c.wording === s.quote);
    case "term":
      return brand.terms.some((t) => t.id === s.id);
    case "wcag":
      return true;
  }
}

/** Approved information that needs attention: expired, overdue for re-verification, or due soon. */
export function staleKnowledge(brand: Brand, today: string) {
  const items = [
    ...brand.facts.map((f) => ({ kind: "fact" as const, id: f.id, label: f.label, owner: f.owner, state: freshness(f, today), due: f.validUntil ?? f.reviewBy })),
    ...brand.claims
      .filter((c) => c.status !== "retired")
      .map((c) => ({ kind: "claim" as const, id: c.id, label: c.label, owner: c.owner, state: c.status === "pending" ? ("pending" as Freshness) : freshness(c, today), due: c.validUntil })),
  ];
  return items.filter((i) => i.state !== "current");
}
