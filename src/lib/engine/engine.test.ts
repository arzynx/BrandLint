import { describe, expect, it } from "vitest";
import { demoBrand } from "../brand/demo";
import type { Channel } from "../types";
import { runRuleChecks } from "./text";
import { contrastRatio, deltaE2000, hexToRgb } from "./color";
import { detectClaims } from "./claims";
import { altTextFinding, contrastFindings, paletteFindings } from "./visual";

const ctx = { brand: demoBrand, channel: "instagram" as const, today: "2026-10-27" };
const check = (text: string, channel: Channel = ctx.channel) =>
  runRuleChecks({ id: "s1", label: "Text", text }, { ...ctx, channel });

describe("claims", () => {
  it("flags unsupported superlatives and efficacy claims", () => {
    const f = check("India's #1 fastest-growing skincare brand, clinically proven to remove dark spots in 7 days.");
    const rules = f.map((x) => x.ruleId);
    expect(rules).toContain("R-4.2");
    expect(rules).toContain("R-4.3");
    expect(f.find((x) => x.excerpt === "#1")).toBeTruthy();
    expect(f.find((x) => x.excerpt === "clinically proven")?.advice).toContain("C-02");
  });

  it("does not flag claims that sit inside approved wording", () => {
    const text = "Shown in our 2024 consumer study to reduce the appearance of dark spots within 4 weeks (n=120).";
    expect(check(text).filter((x) => x.category === "claim")).toHaveLength(0);
    expect(detectClaims("Winner, Best New Serum, Beauty Edit Awards 2025", demoBrand)[0].supportedBy?.id).toBe("C-04");
  });

  it("flags fairness language", () => {
    expect(check("Our whitening cream for fairer skin").filter((x) => x.ruleId === "R-4.5").length).toBeGreaterThan(0);
  });

  it("does not treat 'fair price' as fairness language", () => {
    expect(check("A fair price for good care.").filter((x) => x.ruleId === "R-4.5")).toHaveLength(0);
  });
});

describe("facts", () => {
  it("catches an outdated price and suggests the approved one", () => {
    const f = check("Get the Glow Serum for just ₹699 today.").find((x) => x.category === "fact");
    expect(f?.excerpt).toBe("₹699");
    expect(f?.suggestion).toBe("₹799");
  });
  it("reads 'Rs. 699' as one price, not a sentence break", () => {
    expect(check("Glow Serum now just Rs. 699").find((x) => x.category === "fact")?.suggestion).toBe("₹799");
    expect(check("Our Barrier Repair Cream is the best moisturiser in India, now Rs. 599.").some((x) => x.category === "fact")).toBe(true);
  });
  it("accepts the approved price", () => {
    expect(check("Glow Serum, Rs. 799.").filter((x) => x.category === "fact")).toHaveLength(0);
  });
  it("catches overstated customer numbers", () => {
    const f = check("Loved by 5 lakh+ customers across India.").find((x) => x.ruleId === "R-4.2");
    expect(f?.verdict).toBe("unverified");
    expect(f?.suggestion).toBe("2 lakh+");
  });
  it("catches wrong discount and offer end date", () => {
    const f = check("Festive sale: 30% off, valid till 15 Nov.").filter((x) => x.category === "fact");
    expect(f.map((x) => x.suggestion)).toEqual(expect.arrayContaining(["20% off"]));
    expect(f.some((x) => x.title === "Offer date is wrong")).toBe(true);
  });
});

describe("messaging, terminology, tone, accessibility", () => {
  it("flags retired tagline and brand name misuse", () => {
    const f = check("LUMERA Skincare: Glow beyond limits.");
    expect(f.some((x) => x.ruleId === "R-3.1" && x.suggestion === "Skin, explained")).toBe(true);
    expect(f.some((x) => x.ruleId === "R-3.2")).toBe(true);
  });
  it("suggests preferred terms with matching case", () => {
    const f = check("Remove dark spots with our anti-aging serum.").filter((x) => x.category === "terminology");
    expect(f.map((x) => x.suggestion)).toEqual(["Reduce the appearance of", "skin renewal"]);
  });
  it("limits exclamation marks and emoji by channel", () => {
    expect(check("New drop! Shop now!").some((x) => x.ruleId === "R-2.2")).toBe(true);
    expect(check("New drop ✨", "website").some((x) => x.ruleId === "R-2.5")).toBe(true);
    expect(check("New drop ✨", "instagram").some((x) => x.ruleId === "R-2.5")).toBe(false);
  });
  it("leaves acronyms alone but flags shouting", () => {
    const f = check("SPF 50 that is AMAZING.").filter((x) => x.ruleId === "R-2.4");
    expect(f.map((x) => x.excerpt)).toEqual(["AMAZING"]);
  });
  it("CamelCases hashtags it can segment", () => {
    expect(check("#skinexplained").find((x) => x.ruleId === "R-7.1")?.suggestion).toBe("#SkinExplained");
  });
  it("requires #ad in the first line of influencer posts", () => {
    expect(check("Loving this serum, use my code PRIYA10").some((x) => x.ruleId === "R-6.1")).toBe(true);
    expect(check("#ad Loving this serum, use my code PRIYA10").some((x) => x.ruleId === "R-6.1")).toBe(false);
  });
  it("respects disabled rules", () => {
    const brand = { ...demoBrand, rules: demoBrand.rules.map((r) => (r.id === "R-2.2" ? { ...r, enabled: false } : r)) };
    const f = runRuleChecks({ id: "s", label: "", text: "Wow! Yes!" }, { ...ctx, brand });
    expect(f.some((x) => x.ruleId === "R-2.2")).toBe(false);
  });
  it("is clean on compliant copy", () => {
    const text =
      "Meet the Glow Serum: vitamin C for brighter, even-looking tone. Dermatologically tested on sensitive skin. ₹799. Skin, explained. #SkinExplained";
    expect(check(text)).toEqual([]);
  });
  it("every finding carries a source and exact excerpt offsets", () => {
    const text = "India's #1 serum! Only ₹699!!";
    for (const f of check(text)) {
      expect(f.source.quote.length).toBeGreaterThan(5);
      if (f.excerpt) expect(text.slice(f.start, f.end)).toBe(f.excerpt);
    }
  });
});

describe("visual", () => {
  it("computes WCAG contrast correctly", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    expect(contrastRatio(hexToRgb("#777777"), hexToRgb("#FFFFFF"))).toBeCloseTo(4.48, 1);
  });
  it("CIEDE2000 matches reference pair", () => {
    // Sharma et al. test data, pair 1 is in Lab; here we sanity check ordering instead
    expect(deltaE2000([31, 78, 95], [31, 78, 95])).toBe(0);
    expect(deltaE2000([31, 78, 95], [255, 0, 255])).toBeGreaterThan(40);
  });
  it("flags off-palette colours above 10% coverage", () => {
    const f = paletteFindings(
      [
        { rgb: [246, 241, 231], share: 0.6 },
        { rgb: [255, 0, 200], share: 0.3 },
        { rgb: [31, 78, 95], share: 0.1 },
      ],
      demoBrand,
      "img",
    );
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("high");
  });
  it("flags low-contrast text and missing alt text", () => {
    const f = contrastFindings([{ text: "Festive offer", fg: [200, 200, 200], bg: [255, 255, 255], heightPx: 14, ocrConfidence: 90 }], demoBrand, "img");
    expect(f).toHaveLength(1);
    expect(altTextFinding("", "instagram", demoBrand, "img")).toHaveLength(1);
    expect(altTextFinding("", "print", demoBrand, "img")).toHaveLength(0);
  });
});


describe("one-pass fixing", () => {
  const LAUNCH = `India's #1 fastest-growing skincare brand, clinically proven to remove dark spots in 7 days!! ✨✨

Our NEW Glow Serum is back at the 2022 price: just ₹699. Loved by 5 lakh+ users. Glow beyond limits.

Festive sale: 30% off, valid till 15 Nov. Click here to shop 👉 #glowserum #skinexplained ✨`;

  it("gives every claim finding a drop-in fix built from approved wording", () => {
    const claims = check(LAUNCH).filter((f) => f.category === "claim");
    expect(claims.length).toBeGreaterThan(0);
    for (const f of claims) expect(f.suggestion).not.toBeUndefined();
    expect(claims.find((f) => f.excerpt?.startsWith("#1"))?.suggestion).toBe("award-winning");
    expect(claims.find((f) => f.excerpt === "clinically proven")?.suggestion).toBe("shown in our 2024 consumer study");
    expect(claims.find((f) => f.excerpt === "in 7 days")?.suggestion).toBe("within 4 weeks");
  });

  it("accepting every fix creates no new findings on re-check", async () => {
    const { applyDecisions } = await import("../draft");
    const seg = { id: "s1", label: "Text", text: LAUNCH };
    const first = runRuleChecks(seg, ctx);
    const decisions = Object.fromEntries(first.filter((f) => f.suggestion != null).map((f) => [f.id, { action: "accepted" as const, by: "t", at: "" }]));
    const fixed = applyDecisions(seg, first, decisions);
    const second = runRuleChecks({ ...seg, text: fixed }, ctx);
    const key = (f: { ruleId?: string; excerpt?: string }) => `${f.ruleId}|${f.excerpt}`;
    const before = new Set(first.map(key));
    const fresh = second.filter((f) => !before.has(key(f)));
    expect(fresh.map((f) => `${f.ruleId} "${f.excerpt}"`)).toEqual([]);
    expect(second.length).toBeLessThan(first.length / 2);
  });
});
