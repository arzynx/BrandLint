# BrandLint architecture and technical decisions

## Overview

```
Browser (Next.js client)                               Server (Vercel functions)
────────────────────────────────────────               ────────────────────────────────────────
Workspace store (localStorage)                          POST /api/pdf     unpdf → text per page
  brand: rules, facts, terms, palette, version          POST /api/check   ┌ Layer A: rule engine (deterministic)
  submissions → revisions → findings + decisions                          └ Layer B: Gemini review + grounding guard
  comments, history, audit log                          POST /api/rewrite Gemini rewrite → rule self-check
                                                        POST /api/rule-suggest  clearer clause from dismissals
Image pipeline (in browser)                             GET  /api/status  is the AI layer configured?
  k-means dominant colours → CIEDE2000 vs palette
  tesseract.js OCR → text lines + boxes
  per-line fg/bg split → WCAG contrast
  OCR text ─────────────────────────────────────────▶ /api/check

Workflow UI: findings ↔ highlights, accept/edit/dismiss, revisions + diff, review, insights
```

### The check pipeline

1. **Extract.** Text is used as-is. PDFs go to `/api/pdf` and come back as one segment per page. Images are analysed in the browser (`src/lib/image.ts`): dominant colours via k-means on a 160px downscale, OCR on a 1400px canvas, and for each OCR line the box's pixels are split into two colour clusters (the larger is background, the smaller is text) to measure contrast.
2. **Layer A: rules** (`src/lib/engine/text.ts`, `claims.ts`, `visual.ts`). Pure functions, no I/O. Every rule is tied to a guideline rule id, and a disabled rule produces nothing. Each finding carries `excerpt` and exact `start`/`end` offsets, a `source` (`kind`, `ref`, verbatim `quote`), a confidence, and either a drop-in `suggestion` or `advice`.
3. **Layer B: model** (`src/lib/ai.ts`). One Gemini call per check gets the content, the active rules, the approved facts, what Layer A already flagged, and the Layer A findings that lack a drop-in fix. It returns JSON with new findings and fixes.
4. **Grounding guard.** An AI finding is kept only if (a) its `ruleId` is an active guideline rule, (b) its `excerpt` occurs verbatim in the named segment (offsets are then computed by us, not the model), and (c) it doesn't overlap an existing finding. AI-drafted replacements are run back through the claim detector and dropped if they introduce an unsupported claim. Kept and rejected counts are returned and shown in the UI.
5. **Decisions and revisions.** Accepted/edited replacements are applied right to left by offset to produce the revised draft (`src/lib/draft.ts`). Re-check creates a new revision; dismissals of the same rule on the same text carry over with their reason.
6. **Insights** (`src/lib/insights.ts`) aggregate decisions per rule. A rule is a **guideline gap** when it was flagged at least 4 times and dismissed in at least 40% of decisions.

## Main technical decisions

**Rules first, model second.** Prices, dates, claim words, terminology, contrast and palette are checked in code, so they are reproducible, fast, free and testable. The model only handles what rules can't: tone, indirectly phrased claims, and fix drafting. This keeps cost and latency low and makes most results explainable without the model.

**"No clause, no flag" is enforced in code, not just in the prompt.** Prompts can be ignored; the guard can't. This is what lets every finding quote a real source.

**A single Next.js app instead of Next.js + FastAPI (changed from Round 1).** With one deploy target there are fewer moving parts and nothing to keep in sync, and judges get one link that works. The Python libraries planned in Round 1 were replaced: OpenCV/Pillow → our own k-means and CIEDE2000; Tesseract → tesseract.js; PyMuPDF → unpdf; rapidfuzz → targeted regexes; textstat → explicit tone rules.

**OCR and image analysis run in the browser.** Images never leave the device; only the extracted text is sent for checking. It also avoids heavy native dependencies in serverless functions.

**Browser storage instead of Postgres/pgvector (changed from Round 1).** Each visitor gets an isolated sandbox with no sign-up, nothing confidential is stored on our server, and the public demo can't be polluted by other visitors. The trade-off is that creator and reviewer must share a browser in this build. Retrieval (RAG) wasn't needed yet: a guideline of ~20 rules fits in one prompt, so the model sees all active rules and must cite one by id.

**CIEDE2000 instead of RGB distance.** It's perceptually uniform, so "off-palette" matches what a designer would see. The threshold is ΔE > 12, and off-palette colours must cover more than 10% of the image (guideline §5.1).

**Contrast per OCR line.** WCAG 2.2 SC 1.4.3: 4.5:1 for normal text, 3:1 for large (≥ 24px; we treat OCR line boxes ≥ 22px as large).

**Confidence is honest, not decorative.** Exact phrase matches score 0.9 to 0.97; single-word terms 0.85; ambiguous words like "best" 0.7; OCR-derived findings are capped at 0.8; AI findings are clamped to 0.3 to 0.9. Findings below 0.6 are grouped as "Worth a look".

**Graceful degradation.** No key, timeout, invalid JSON or quota errors → the check still returns rule findings with `aiStatus: "error" | "offline"`, and the UI says so. Model ids are tried in order (`GEMINI_MODEL`, `gemini-3.5-flash`, `gemini-flash-latest`, `gemini-3-flash-preview`) and the first that works is remembered.

## Security and privacy

- API key only on the server (`server-only` import guard); never sent to the browser.
- No server-side persistence of content; PDFs are parsed in memory.
- Input validation and limits: 4 MB uploads, 60k characters per check, 40 segments, brand payload ≤ 200 KB.
- Per-IP rate limits on every API route (best effort, per instance).
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- Confidential mode disables the AI layer per check.
- Role permissions are enforced in the UI (creator decides findings; reviewer approves; only the owner edits rules). With no server-side accounts in this build, this is a workflow control, not a security boundary.

## Testing

- `npm test`: 22 Vitest unit tests on the rule engine (claims, facts, prices with "Rs." abbreviations, offer dates, taglines, terminology casing, tone limits by channel, hashtags, disclosure, disabled rules, a clean-copy negative test, offset integrity, WCAG contrast, CIEDE2000, palette and alt-text findings).
- `npm run e2e`: Playwright drives the real app through the whole workflow: text check → decide all findings → re-check → submit → reviewer approves → PDF check → image check with OCR (off-brand and on-brand) → insights → owner rewrites a gap rule. It fails on any page or console error.
- `/eval`: claim detector precision/recall on 100 labelled sentences, computed live.

## Known limitations

- Tone judgements are subjective; AI tone findings are suggestions.
- OCR misses faint, stylised, rotated or curved text, and contrast measurement can be confused by gradients or photos behind text.
- The claim lexicon misses indirect claims (see `/eval`); the AI layer is meant to cover these, but its accuracy isn't measured yet.
- Fact checks cover prices, customer counts, discounts and offer dates for facts with known aliases; free-form facts rely on the AI layer.
- No logo detection, DOCX support, sign-in, shared multi-user workspace or integrations yet.
- Rate limiting is in-memory per serverless instance.

## Code map

```
src/lib/engine/   text.ts (rule checks) · claims.ts (lexicon + support matching) · visual.ts (palette/contrast/alt) · color.ts · util.ts · engine.test.ts
src/lib/          ai.ts (Gemini + grounding guard) · checkClient.ts (pipeline) · image.ts (browser image analysis)
                  draft.ts (apply decisions, diff) · insights.ts · importRules.ts · store.ts · seed.ts · samples.ts · brand/demo.ts
src/app/          api/{check,pdf,rewrite,rule-suggest,status} · submit · s/[id] · submissions · review · insights · guideline · eval · trust
scripts/          e2e.mjs · make-sample-pdf.mjs
```
