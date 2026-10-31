"use client";

import { altTextFinding, contrastFindings, paletteFindings } from "./engine/visual";
import { analyzeImage } from "./image";
import type { Audience, Brand, Channel, CheckMeta, ContentContext, Finding, Format, Segment, Submission } from "./types";

export interface CheckInput {
  format: Format;
  channel: Channel;
  audience?: Audience;
  region?: string;
  campaign?: string;
  brand: Brand;
  useAI: boolean;
  text?: string;
  file?: Blob;
  altText?: string;
  onProgress?: (msg: string) => void;
}

export interface CheckOutput {
  segments: Segment[];
  findings: Finding[];
  meta: CheckMeta;
  thumb?: string;
}

export type ContextInput = Pick<ContentContext, "channel"> & Partial<ContentContext>;

/** The review context a submission was created with. */
export function contextOf(sub: Pick<Submission, "channel" | "audience" | "region" | "campaign">): ContextInput {
  return { channel: sub.channel, audience: sub.audience, region: sub.region, campaign: sub.campaign };
}

export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function checkSegments(segments: Segment[], where: Channel | ContextInput, brand: Brand, useAI: boolean) {
  const ctx = typeof where === "string" ? { channel: where } : where;
  const res = await fetch("/api/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments, ...ctx, brand, useAI, today: localToday() }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `Check failed (${res.status})`);
  return j as { findings: Finding[]; meta: CheckMeta };
}

export async function runCheck(input: CheckInput): Promise<CheckOutput> {
  const { format, channel, brand, useAI, onProgress } = input;
  const ctx: ContextInput = { channel, audience: input.audience, region: input.region, campaign: input.campaign };
  let segments: Segment[] = [];
  let visual: Finding[] = [];
  let thumb: string | undefined;

  if (format === "text") {
    if (!input.text?.trim()) throw new Error("Paste some text to check.");
    segments = [{ id: "s1", label: "Text", text: input.text }];
  } else if (format === "pdf") {
    if (!input.file) throw new Error("Choose a PDF.");
    onProgress?.("Extracting text from each page…");
    const fd = new FormData();
    fd.append("file", input.file);
    const res = await fetch("/api/pdf", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "Couldn't read the PDF.");
    segments = (j.pages as string[])
      .map((t, i) => ({ id: `p${i + 1}`, label: `Page ${i + 1}`, text: t }))
      .filter((s) => s.text.trim().length > 0);
    if (segments.length === 0) throw new Error("This PDF has no extractable text (it may be scanned). Upload the pages as images instead.");
  } else {
    if (!input.file) throw new Error("Choose an image.");
    const a = await analyzeImage(input.file, onProgress);
    thumb = a.thumb;
    const scale = 1;
    visual = [
      ...altTextFinding(input.altText, channel, brand, "img"),
      ...paletteFindings(a.colors, brand, "img"),
      ...contrastFindings(a.regions, brand, "img", scale),
    ];
    if (a.ocrText.trim()) segments = [{ id: "ocr", label: "Text in image (OCR)", text: a.ocrText }];
  }

  let findings: Finding[] = [];
  let meta: CheckMeta = { aiStatus: "offline", aiProposed: 0, aiRejected: 0, ms: 0 };
  if (segments.length) {
    onProgress?.(useAI ? "Running rule checks, then the AI layer…" : "Running rule checks…");
    const r = await checkSegments(segments, ctx, brand, useAI);
    findings = r.findings;
    meta = r.meta;
    if (format === "image") {
      // OCR text can be misread; lower confidence accordingly and say so.
      findings = findings.map((f) => ({ ...f, confidence: Math.min(f.confidence, 0.8), message: f.message + " (read from the image by OCR)" }));
    }
  }
  if (format === "image") segments = [{ id: "img", label: "Image", text: "" }, ...segments];
  return { segments, findings: [...visual, ...findings], meta, thumb };
}
