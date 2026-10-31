# BrandLint

**Brand assurance and governance, before anything goes live.**

Organisations write brand guidelines, but nothing checks that people follow them. Marketing teams, agencies, freelancers and AI tools all publish content, and small mistakes add up to *brand drift*: hype instead of the agreed tone, a product name spelt three ways, an invented "95% improvement", a price from last quarter, a claim nobody can substantiate.

BrandLint sits between writing and publishing. It checks content against the organisation's **own approved knowledge** (guideline rules, approved facts, a claim registry and terminology), explains every issue with the exact source it comes from, and routes the decision to the right person. It never publishes and never silently rejects. Over time, it shows the brand team which rules people misunderstand, dispute or contradict, so the guideline itself gets better.

- **Live demo:** https://brandlint.vercel.app (no sign-up; each visitor gets a private demo workspace for **Lumera Skin**, a fictional skincare brand)
- **Architecture and technical decisions:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Three ideas the product is built on

### 1. Evidence-linked findings
Every finding answers five questions: what was detected, why it is a problem, which approved source says so, how serious it is, and how to fix it.

- Each citation names the guideline clause, its **source document** and the **guideline version** it was checked against, plus the approved fact or claim the content was compared with.
- A **verdict** separates three different situations, because an unsupported statement is not the same as a false one:
  - **Contradicts:** conflicts with approved information (a wrong price, discount or offer date).
  - **Unverified:** no approved evidence exists for it. It may be true, but it can't be published until it is substantiated.
  - **Breach:** the guideline forbids it regardless of evidence (absolute promises, fairness language, a missing #ad).
- The AI is never the source of truth. An AI finding is discarded unless it cites an approved rule that applies to this content and quotes text that really exists. A final server-side check drops any citation that doesn't resolve to a real record in the current guideline version.

### 2. Confidence-aware human governance
Severity says how much a problem matters; confidence says how sure the system is. Together they decide who must look at it.

- Findings are routed as **Must fix**, **Needs a reviewer's judgement**, **Review** or **Worth a look**.
- Creators accept, edit or dismiss with a reason. Only reviewers and owners can override, and dismissing a high-risk claim or fact needs the **brand owner's sign-off**.
- Approval never clears anything implicitly: each escalated item is ruled on individually (upheld or reinstated).

### 3. Guideline intelligence
The review history is used to improve the rules, not just the content.

- **Guideline gaps:** rules people keep overriding, with their reasons and a one-click rewrite.
- **Disputed rules:** rules where reviewers keep reinstating what creators dismissed. In the demo, the "remove → reduce the appearance of" terminology rule is the one people read differently.
- **Conflicting instructions:** a clause whose own example breaks another rule. The demo includes a realistic case: the influencer playbook recommends the hook "Obsessed!!", which breaks the brand book's exclamation-mark and capitals rules.
- **Stale knowledge:** approved facts and claims that have expired, are overdue for re-verification, or are still pending.

---

## The brand knowledge base

| Record | What it stores |
|---|---|
| **Rules** | Clause text, category, severity, status (draft / approved / retired), source document, owner, and scope (channel, audience, region, campaign) |
| **Approved facts** | Prices and offers, with source, owner, last-verified date, review-by date and expiry |
| **Claim registry** | Promotional claims (statistics, rankings, efficacy, awards, certifications) with approved wording, evidence, status (verified / pending / retired), owner, expiry and where they may be used |
| **Terminology** | Avoid / prefer pairs with the reason |
| **Visual** | Brand palette and tagline |

Rules can be imported from a pasted or uploaded guideline (PDF). Extracted sentences are only candidates: the owner confirms each one before it is enforced.

Context matters: the demo has a formal-register rule that only applies to investor and press content, and a customer-count claim that is approved for India only.

## What it checks

- **Formats:** text, PDF (page by page) and images (PNG/JPG, with OCR so text inside images is checked too)
- **Facts:** prices, discounts and offer end dates against Approved Facts, attributed to the product they refer to
- **Claims:** rankings, superlatives, statistics, clinical and efficacy claims, absolute promises and fairness language, unless covered by a usable Claim Registry entry; influencer posts need #ad or #collab in the first line (ASCI)
- **Terminology, messaging and tone:** avoid-list terms, retired taglines, brand-name misuse, exclamation and ALL-CAPS limits, emoji limits per channel, skin-shaming language
- **Accessibility:** CamelCase hashtags, descriptive link text, alt text, WCAG 2.2 text contrast on images
- **Visual:** dominant colours against the brand palette (CIEDE2000) and the share of off-palette area
- **AI layer (Gemini):** tone and indirect claims the rules can't judge, plus drafted fixes. Every suggested fix is re-checked by the rule engine before it is shown.

## Try it

1. Open the app. The hero runs a live check on one of three examples (a creator post, a festive email or a website banner); on desktop, scrolling drives it.
2. Click **Try it in 60 seconds**, then **Run checks**. Each finding is highlighted and explained with its source.
3. **Accept**, **Edit** or **Dismiss** with a reason, then re-check as a new revision.
4. **Submit for review**, switch to **Rahul (Reviewer)** from the avatar menu, and approve or request changes.
5. Open **Guideline** to see rules, facts and the claim registry; **Insights** for gaps and trends; **Accuracy** for the claim detector's measured precision and recall.
6. Press **Ctrl K** anywhere to jump to a page, run a sample or switch role. The bar under the header shows the guideline version, the review queue and how many facts and claims need re-verification.

## Status: what is in the interface and what is engine-only

Everything below "Three ideas" is implemented and covered by unit tests in `src/lib`. Some of it does not have a screen yet:

- **In the interface now:** checks and findings, accept / edit / dismiss, revisions, review and approval, guideline editor and import, claim registry list, insights with guideline gaps, accuracy page, command palette, workspace status bar.
- **Engine-level, interface in progress:** verdict labels and evidence records on finding cards, per-finding routing and owner sign-off in the review screen, audience / region / campaign selection on a new check, and the disputed-rule, conflict and stale-knowledge panels on Insights.

## Tech stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, React 19, TypeScript), Tailwind CSS 4, deployed on Vercel |
| Rule engine | Own TypeScript code (`src/lib/engine`): regex and lexicon checks, fact and claim matching, WCAG contrast, CIEDE2000, k-means |
| Knowledge and governance | `src/lib/knowledge.ts` (scope, freshness, citation resolution), `src/lib/governance.ts` (routing, approval requirements), `src/lib/insights.ts` (gaps, disputes, conflicts) |
| AI | Google Gemini API via REST (`gemini-3.5-flash`, with fallbacks), JSON output |
| PDF | `unpdf` (PDF.js serverless build) on the server, in memory |
| OCR | `tesseract.js` in the browser (WASM worker and English model loaded from the jsDelivr CDN) |
| Storage | Browser `localStorage` (per-visitor sandbox); no server database |
| Tests | Vitest (49 engine and governance unit tests), Playwright (end-to-end browser script) |

## External services, libraries and data (disclosure)

- **Google Gemini API:** tone and claim review, fix drafting, full rewrites, rule-rewrite suggestions. Only the content being checked, the applicable rules, approved facts and usable registry claims are sent. Not called in confidential mode or when no key is set.
- **jsDelivr CDN:** serves the Tesseract worker/WASM and English language data to the browser.
- **Vercel:** hosting.
- **Libraries:** next, react, tailwindcss, tesseract.js (Apache-2.0), unpdf (MIT, bundles PDF.js, Apache-2.0), server-only; dev: vitest, playwright, pdf-lib (to generate the sample PDF), eslint, typescript.
- **Datasets:** none external. The claim lexicon, the demo brand (Lumera Skin, fictional), the sample content and the 100-sentence labelled evaluation set were written for this project. The sample history on the Insights page is generated by `src/lib/seed.ts` and labelled as sample data in the UI.
- **Standards referenced:** WCAG 2.2 (SC 1.1.1, 1.4.3); ASCI influencer disclosure guidelines.
- **Templates and third-party code:** project scaffolded with `create-next-app`. The animated background (`src/components/ui/data-rain.tsx`) is adapted from a third-party React component snippet; the light theme, styles and integration were added here. _Add the original source link._

## Project history

BrandLint began as an entry to the Inkloom AI brand-governance challenge (October 2026). This repository contains the current version, extended into the brand assurance and governance product described above.

## AI assistance (disclosure)

This project was built with **Claude Code (Anthropic)** as an AI coding assistant. A large share of the source code, tests, sample content and documentation was generated with it under my direction: I set the product scope, the workflow, the priorities and what to cut, and reviewed and tested the result. The AI model *inside* the product is Google Gemini, as described above.

## Contribution

Solo project. Arzaan Khan: product definition and research, scope and workflow decisions, direction and review of the AI-assisted build, testing, deployment and submission.

## User testing

_To be filled in: who tried the live link, what they did, what they said, and what changed as a result._

## Run locally

```bash
npm install
echo GEMINI_API_KEY=your-key > .env.local   # optional; without it BrandLint runs rule checks only
npm run dev                                  # http://localhost:3000
npm test                                     # unit tests
npm run build && npm start -- -p 3100
npm run e2e -- http://localhost:3100         # end-to-end browser script (needs: npx playwright install chromium)
```

Optional: `GEMINI_MODEL` to pin a specific Gemini model. The end-to-end script predates the new header and may need its selectors updated.

## Known limitations

- Tone is subjective; the AI layer helps, but findings there carry lower confidence.
- The claim word list misses indirect claims; this is measured on the Accuracy page.
- OCR struggles with busy or stylised images.
- Facts and claims are matched by keywords in the same sentence, so a price with no product named nearby isn't checked.
- No logo detection, DOCX support or real sign-in yet. The workspace lives in one browser, so creator, reviewer and owner share a device in this demo.
