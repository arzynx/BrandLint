import { describe, expect, it } from "vitest";
import { demoBrand } from "./brand/demo";
import { hasUnsupportedClaim } from "./engine/claims";
import { runRuleChecks, type CheckContext } from "./engine/text";
import { approvalRequirements, canApprove, canDecide, routeOf, routing } from "./governance";
import { computeInsights, findConflicts, recommendedExamples } from "./insights";
import { context, freshness, resolveSource, staleKnowledge } from "./knowledge";
import { seedHistory } from "./seed";
import type { Decision, Finding, Revision } from "./types";

const base: CheckContext = { brand: demoBrand, channel: "instagram", today: "2026-10-31" };
const check = (text: string, over: Partial<CheckContext> = {}) => runRuleChecks({ id: "s1", label: "Text", text }, { ...base, ...over });

describe("verdicts: unsupported is not the same as false", () => {
  it("a wrong price contradicts approved facts", () => {
    expect(check("Glow Serum, just ₹699.").find((f) => f.ruleId === "R-4.1")?.verdict).toBe("contradicts");
  });
  it("a claim with no evidence is unverified, an absolute promise is a breach", () => {
    const f = check("India's #1 serum, guaranteed.");
    expect(f.find((x) => x.excerpt?.startsWith("#1"))?.verdict).toBe("unverified");
    expect(f.find((x) => x.excerpt?.startsWith("guaranteed"))?.verdict).toBe("breach");
  });
  it("a higher customer count is unverified and suggests the registry figure", () => {
    const f = check("Trusted by 1 crore customers.").find((x) => x.ruleId === "R-4.2")!;
    expect(f.verdict).toBe("unverified");
    expect(f.suggestion).toBe("2 lakh+");
    expect(f.evidence?.id).toBe("C-01");
  });
});

describe("regressions", () => {
  it("compares a price with the product it follows, not every product in the sentence", () => {
    const text = "Our Glow Serum won Best New Serum, and our Daily Sunscreen SPF 50 is now ₹549.";
    expect(check(text).filter((x) => x.ruleId === "R-4.1")).toHaveLength(0);
    expect(check("Our Glow Serum is ₹799 and our Daily Sunscreen is ₹599.").find((x) => x.ruleId === "R-4.1")?.suggestion).toBe("₹549");
  });
  it("cites the claim a fix is built from as evidence", () => {
    const f = check("India's #1 serum for dark spots.").find((x) => x.excerpt?.startsWith("#1"))!;
    expect(f.evidence?.id).toBe("C-04");
    expect(f.message).toContain("is a ranking claim");
    expect(check("No side effects.")[0].message).toContain("is an absolute promise");
  });
});

describe("claim registry", () => {
  it("a pending claim can't be used yet", () => {
    const f = check("Our barrier cream gives 72-hour hydration.").find((x) => x.category === "claim")!;
    expect(f.verdict).toBe("unverified");
    expect(f.message).toContain("C-05");
    expect(f.message).toContain("pending");
  });
  it("a retired claim can't be used", () => {
    const f = check("The fastest-growing skincare brand.").find((x) => x.excerpt?.startsWith("fastest-growing"))!;
    expect(f.message).toContain("C-06");
    expect(f.message).toContain("retired");
  });
  it("a claim is only usable where its usage scope allows", () => {
    const text = "Trusted by 2 lakh+ customers.";
    expect(check(text, { region: "IN" }).filter((x) => x.ruleId === "R-4.2")).toHaveLength(0);
    const f = check(text, { region: "UK" }).find((x) => x.ruleId === "R-4.2")!;
    expect(f.message).toContain("approved for IN only");
  });
  it("claims stop counting as evidence when their evidence expires", () => {
    const text = "Shown in our 2024 consumer study to reduce the appearance of dark spots within 4 weeks (n=120).";
    expect(check(text).filter((x) => x.category === "claim")).toHaveLength(0);
    expect(check(text, { today: "2027-04-01" }).some((x) => x.message.includes("expired"))).toBe(true);
  });
  it("the evaluation classifier respects registry status", () => {
    expect(hasUnsupportedClaim("The fastest-growing skincare brand in the country.", demoBrand)).toBe(true);
    expect(hasUnsupportedClaim("Dermatologically tested on sensitive skin.", demoBrand)).toBe(false);
  });
});

describe("approved information freshness", () => {
  it("flags a matching price whose fact is overdue for re-verification", () => {
    const f = check("Barrier Repair Cream, ₹649.").find((x) => x.ruleId === "R-4.1")!;
    expect(f.severity).toBe("low");
    expect(f.verdict).toBe("unverified");
    expect(check("Barrier Repair Cream, ₹649.", { today: "2026-10-10" }).filter((x) => x.ruleId === "R-4.1")).toHaveLength(0);
  });
  it("classifies freshness", () => {
    expect(freshness({ reviewBy: "2026-12-31" }, "2026-10-31")).toBe("current");
    expect(freshness({ reviewBy: "2026-11-05" }, "2026-10-31")).toBe("review_soon");
    expect(freshness({ reviewBy: "2026-10-15" }, "2026-10-31")).toBe("review_overdue");
    expect(freshness({ validUntil: "2026-10-01" }, "2026-10-31")).toBe("expired");
  });
  it("lists stale knowledge for the owner", () => {
    const ids = staleKnowledge(demoBrand, "2026-10-31").map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["F-02", "C-05", "F-04"]));
    expect(ids).not.toContain("F-01");
  });
});

describe("context-aware rules", () => {
  it("applies the formal-register rule only to investor and press content", () => {
    const text = "Q3 update: revenue grew 40% 🎉";
    expect(check(text).some((x) => x.ruleId === "R-2.6")).toBe(false);
    expect(check(text, { audience: "investors" }).some((x) => x.ruleId === "R-2.6")).toBe(true);
  });
  it("ignores draft and retired rules", () => {
    const brand = { ...demoBrand, rules: demoBrand.rules.map((r) => (r.id === "R-2.2" ? { ...r, status: "draft" as const } : r)) };
    expect(check("Wow! Yes!", { brand }).some((x) => x.ruleId === "R-2.2")).toBe(false);
  });
  it("fills in default context", () => {
    expect(context("email")).toEqual({ channel: "email", audience: "customers", region: "IN", campaign: undefined });
    expect(context("email", { audience: undefined, region: " " }).region).toBe("IN");
  });
});

describe("evidence-linked citations", () => {
  const LAUNCH = `India's #1 fastest-growing skincare brand, clinically proven to remove dark spots in 7 days!! ✨✨
Our NEW Glow Serum is back at the 2022 price: just ₹699. Loved by 5 lakh+ users. Glow beyond limits.
Festive sale: 30% off, valid till 15 Nov. Click here to shop 👉 #glowserum #skinexplained ✨`;

  it("every finding cites a record that exists in this guideline version", () => {
    const found = check(LAUNCH);
    expect(found.length).toBeGreaterThan(10);
    for (const f of found) {
      expect(f.source.version).toBe(demoBrand.version);
      expect(resolveSource(demoBrand, f.source)).toBe(true);
      if (f.evidence) expect(resolveSource(demoBrand, f.evidence)).toBe(true);
    }
  });
  it("rejects invented or outdated references", () => {
    expect(resolveSource(demoBrand, { kind: "rule", id: "R-9.9", ref: "Guideline §9.9", quote: "x", version: demoBrand.version })).toBe(false);
    const real = demoBrand.rules[0];
    expect(resolveSource(demoBrand, { kind: "rule", id: real.id, ref: "", quote: "paraphrased clause", version: demoBrand.version })).toBe(false);
    expect(resolveSource(demoBrand, { kind: "rule", id: real.id, ref: "", quote: real.text, version: demoBrand.version - 1 })).toBe(false);
  });
});

describe("confidence-aware governance", () => {
  const finding = (over: Partial<Finding>): Finding => ({
    id: "f1",
    category: "claim",
    severity: "high",
    verdict: "unverified",
    title: "Claim",
    message: "",
    segmentId: "s1",
    source: { kind: "rule", ref: "", quote: "" },
    confidence: 0.9,
    origin: "rule",
    ...over,
  });
  const rev = (findings: Finding[], decisions: Record<string, Decision> = {}): Revision => ({
    n: 1,
    segments: [],
    findings,
    decisions,
    meta: { aiStatus: "offline", aiProposed: 0, aiRejected: 0, ms: 0 },
    createdAt: "",
    by: "",
  });

  it("routes by severity and confidence", () => {
    expect(routeOf({ severity: "high", confidence: 0.9 })).toBe("blocker");
    expect(routeOf({ severity: "high", confidence: 0.6 })).toBe("escalate");
    expect(routeOf({ severity: "medium", confidence: 0.8 })).toBe("review");
    expect(routeOf({ severity: "low", confidence: 0.99 })).toBe("advisory");
  });

  it("creators can't override; only the owner can override a high-risk claim", () => {
    const f = finding({});
    expect(canDecide("creator", "overridden", f)).toBe(false);
    expect(canDecide("reviewer", "overridden", f)).toBe(false);
    expect(canDecide("owner", "overridden", f)).toBe(true);
    expect(canDecide("reviewer", "overridden", finding({ category: "tone" }))).toBe(true);
  });

  it("a creator-dismissed high-risk claim escalates to the owner until they uphold it", () => {
    const f = finding({});
    const dismissed: Decision = { action: "dismissed", reason: "Legal said ok", by: "Priya", role: "creator", at: "" };
    expect(routing(rev([f], { f1: dismissed })).level).toBe("escalated");
    expect(canApprove("reviewer", rev([f], { f1: dismissed })).ok).toBe(false);

    const byReviewer = { ...dismissed, review: { outcome: "upheld" as const, by: "Rahul", role: "reviewer" as const, at: "" } };
    expect(canApprove("reviewer", rev([f], { f1: byReviewer })).ok).toBe(false);

    const byOwner = { ...dismissed, review: { outcome: "upheld" as const, by: "Ananya", role: "owner" as const, at: "" } };
    expect(approvalRequirements(rev([f], { f1: byOwner }))[0].cleared).toBe(true);
    expect(canApprove("reviewer", rev([f], { f1: byOwner })).ok).toBe(true);

    const reinstated = { ...dismissed, review: { outcome: "reinstated" as const, by: "Ananya", role: "owner" as const, at: "" } };
    expect(canApprove("owner", rev([f], { f1: reinstated })).ok).toBe(false);
  });

  it("a reviewer can clear a dismissed tone blocker; fixed content fast-tracks", () => {
    const f = finding({ category: "tone" });
    const d: Decision = { action: "dismissed", reason: "Quote", by: "Priya", role: "creator", at: "", review: { outcome: "upheld", by: "Rahul", role: "reviewer", at: "" } };
    expect(canApprove("reviewer", rev([f], { f1: d })).ok).toBe(true);
    expect(routing(rev([f], { f1: { action: "accepted", by: "Priya", at: "" } })).level).toBe("fast_track");
    expect(canApprove("creator", rev([])).ok).toBe(false);
  });
});

describe("guideline intelligence", () => {
  it("reads recommended examples, not prohibited ones", () => {
    expect(recommendedExamples('Open with a hook, e.g. "Obsessed!!" or "You NEED this".')).toEqual(["Obsessed!!", "You NEED this"]);
    expect(recommendedExamples('Always write "Lumera Skin" or "Lumera". Never "LUMERA", "Lumera Skincare" or "Lumera Cosmetics".')).toEqual([
      "Lumera Skin",
      "Lumera",
    ]);
    expect(recommendedExamples('Do not promise "guaranteed" or "100%".')).toEqual([]);
  });

  it("finds the playbook clause that contradicts the brand book", () => {
    const c = findConflicts(demoBrand, "2026-10-31").filter((x) => x.kind === "contradiction");
    expect(c.map((x) => `${x.a.id}>${x.b.id}`)).toEqual(expect.arrayContaining(["R-6.2>R-2.2", "R-6.2>R-2.4"]));
    // approved wording, the tagline and preferred terms are all consistent with the rules
    expect(c.every((x) => x.a.id === "R-6.2")).toBe(true);
  });

  it("surfaces disputed rules and stale knowledge from history", () => {
    const ins = computeInsights(seedHistory(), demoBrand, "2026-10-31");
    expect(ins.disputes.map((d) => d.key)).toContain("T-01");
    expect(ins.byVerdict.unverified).toBeGreaterThan(0);
    expect(ins.byVerdict.contradicts).toBeGreaterThan(0);
    expect(ins.stale.length).toBeGreaterThan(0);
  });
});
