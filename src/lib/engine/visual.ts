import type { Brand, Channel, Finding } from "../types";
import { contrastRatio, deltaE2000, hexToRgb, rgbToHex, type RGB } from "./color";
import { ruleSource } from "../knowledge";
import { uid } from "./util";

export const OFF_PALETTE_DELTA = 12; // CIEDE2000; above this a colour reads as a different colour
export const OFF_PALETTE_SHARE = 0.1; // §5.1: off-palette may cover at most 10%

export interface TextRegion {
  text: string;
  fg: RGB;
  bg: RGB;
  heightPx: number; // height in the original image
  ocrConfidence: number; // 0..100
}

export function nearestBrandColor(rgb: RGB, brand: Brand) {
  return brand.palette
    .map((p) => ({ ...p, d: deltaE2000(rgb, hexToRgb(p.hex)) }))
    .sort((a, b) => a.d - b.d)[0];
}

export function paletteFindings(colors: { rgb: RGB; share: number }[], brand: Brand, segmentId: string): Finding[] {
  const rule = brand.rules.find((r) => r.id === "R-5.1" && r.enabled && r.status === "approved");
  if (!rule || brand.palette.length === 0) return [];
  const off = colors
    .map((c) => ({ ...c, near: nearestBrandColor(c.rgb, brand) }))
    .filter((c) => c.near.d > OFF_PALETTE_DELTA && c.share >= 0.03);
  const offShare = off.reduce((s, c) => s + c.share, 0);
  if (offShare <= OFF_PALETTE_SHARE) return [];
  return off
    .filter((c) => c.share >= 0.05)
    .map((c) => ({
      id: uid("f"),
      ruleId: rule.id,
      category: "visual" as const,
      severity: c.share > 0.25 ? ("high" as const) : rule.severity,
      title: "Off-palette colour",
      message: `${rgbToHex(c.rgb)} covers ${Math.round(c.share * 100)}% of the image. Nearest brand colour is ${c.near.name} (${c.near.hex}), ΔE2000 = ${c.near.d.toFixed(1)}. Total off-palette area: ${Math.round(offShare * 100)}%.`,
      segmentId,
      source: ruleSource(rule, brand.version),
      verdict: "breach" as const,
      confidence: Math.min(0.95, 0.6 + c.near.d / 100),
      advice: `Swap ${rgbToHex(c.rgb)} for ${c.near.name} ${c.near.hex}.`,
      origin: "vision" as const,
    }));
}

export function contrastFindings(regions: TextRegion[], brand: Brand, segmentId: string, scale = 1): Finding[] {
  const rule = brand.rules.find((r) => r.id === "R-7.3" && r.enabled && r.status === "approved");
  if (!rule) return [];
  const out: Finding[] = [];
  for (const r of regions) {
    if (r.text.replace(/[^\p{L}\p{N}]/gu, "").length < 3) continue;
    const ratio = contrastRatio(r.fg, r.bg);
    // WCAG "large text" is 24px+; an OCR line box for 24px type is roughly 22px tall.
    const large = r.heightPx * scale >= 22;
    const min = large ? 3 : 4.5;
    if (ratio >= min) continue;
    out.push({
      id: uid("f"),
      ruleId: rule.id,
      category: "accessibility",
      severity: ratio < 2 ? "high" : rule.severity,
      title: "Low text contrast",
      message: `"${r.text.trim().slice(0, 60)}" has contrast ${ratio.toFixed(2)}:1 (${rgbToHex(r.fg)} on ${rgbToHex(r.bg)}); ${large ? "large" : "normal"} text needs ${min}:1.`,
      segmentId,
      excerpt: undefined,
      source: { ...ruleSource(rule, brand.version), kind: "wcag", ref: `WCAG 2.2 SC 1.4.3 / Guideline ${rule.section}` },
      verdict: "breach",
      confidence: Math.max(0.5, Math.min(0.95, r.ocrConfidence / 100)),
      advice: `Darken the text or lighten the background until it reaches ${min}:1.`,
      origin: "vision",
    });
  }
  return out;
}

export function altTextFinding(altText: string | undefined, channel: Channel, brand: Brand, segmentId: string): Finding[] {
  const rule = brand.rules.find((r) => r.id === "R-7.2" && r.enabled && r.status === "approved");
  if (!rule || channel === "print") return [];
  if (altText && altText.trim().length >= 10) return [];
  return [
    {
      id: uid("f"),
      ruleId: rule.id,
      category: "accessibility",
      severity: rule.severity,
      title: altText?.trim() ? "Alt text too short" : "Missing alt text",
      message: "Images published online need alt text that describes them (WCAG 2.2 SC 1.1.1).",
      segmentId,
      source: { ...ruleSource(rule, brand.version), kind: "wcag", ref: `WCAG 2.2 SC 1.1.1 / Guideline ${rule.section}` },
      verdict: "breach",
      confidence: 0.99,
      advice: "Add alt text describing what the image shows, e.g. product, setting and any text in it.",
      origin: "vision",
    },
  ];
}
