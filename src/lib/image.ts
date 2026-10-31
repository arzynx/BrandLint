"use client";

import { dominantColors, luminance, type RGB } from "./engine/color";
import type { TextRegion } from "./engine/visual";

export interface ImageAnalysis {
  thumb: string;
  colors: { rgb: RGB; share: number }[];
  regions: TextRegion[];
  ocrText: string;
  ocrConfidence: number;
  width: number;
  height: number;
}

function canvasFor(bmp: ImageBitmap, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return { c, ctx, scale };
}

/** Split pixels in a text box into two colour groups: the bigger one is background, the smaller is text. */
function textColors(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): { fg: RGB; bg: RGB } | null {
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  if (w < 4 || h < 4) return null;
  const d = ctx.getImageData(x0, y0, w, h).data;
  const px: RGB[] = [];
  const step = Math.max(1, Math.floor((w * h) / 4000));
  for (let i = 0; i < w * h; i += step) px.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
  const groups = dominantColors(px, 2, 8);
  if (groups.length < 2) return null;
  const [bg, fg] = groups; // sorted by share
  // guard against near-uniform boxes
  if (Math.abs(luminance(bg.rgb) - luminance(fg.rgb)) < 0.005 && fg.share < 0.05) return null;
  return { fg: fg.rgb, bg: bg.rgb };
}

export async function analyzeImage(file: Blob, onProgress?: (msg: string) => void): Promise<ImageAnalysis> {
  const bmp = await createImageBitmap(file);

  onProgress?.("Measuring colours…");
  const small = canvasFor(bmp, 160);
  const sd = small.ctx.getImageData(0, 0, small.c.width, small.c.height).data;
  const pixels: RGB[] = [];
  for (let i = 0; i < sd.length; i += 4) pixels.push([sd[i], sd[i + 1], sd[i + 2]]);
  const colors = dominantColors(pixels, 6, 12);

  const thumbC = canvasFor(bmp, 640);
  const thumb = thumbC.c.toDataURL("image/jpeg", 0.75);

  onProgress?.("Reading text in the image (OCR)…");
  const big = canvasFor(bmp, 1400);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(`Reading text in the image… ${Math.round(m.progress * 100)}%`);
    },
  });
  try {
    const { data } = await worker.recognize(big.c, {}, { blocks: true, text: true });
    const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
    const regions: TextRegion[] = [];
    const kept: string[] = [];
    for (const l of lines) {
      const text = l.text.trim();
      if (l.confidence < 45 || text.replace(/[^\p{L}\p{N}]/gu, "").length < 2) continue;
      kept.push(text);
      const tc = textColors(big.ctx, l.bbox.x0, l.bbox.y0, l.bbox.x1, l.bbox.y1);
      if (tc) regions.push({ text, ...tc, heightPx: (l.bbox.y1 - l.bbox.y0) / big.scale, ocrConfidence: l.confidence });
    }
    const conf = lines.length ? lines.reduce((s, l) => s + l.confidence, 0) / lines.length : 0;
    return { thumb, colors, regions, ocrText: kept.join("\n"), ocrConfidence: conf, width: bmp.width, height: bmp.height };
  } finally {
    await worker.terminate();
  }
}

/** Render an SVG sample (from /public) to a PNG blob so it goes through the same pipeline as an upload. */
export async function svgToPng(url: string): Promise<Blob> {
  const svg = await (await fetch(url)).text();
  const img = new Image();
  const src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("sample failed to load"));
    img.src = src;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || 1080;
  c.height = img.naturalHeight || 1080;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(src);
  return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
}
