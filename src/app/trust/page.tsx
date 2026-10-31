"use client";

import { useAiStatus } from "@/components/Shell";
import { PageHero, heroBtn, heroBtnGhost } from "@/components/PageHero";
import Link from "next/link";


export default function TrustPage() {
  const ai = useAiStatus();
  return (
    <>
    <PageHero
      eyebrow="How it works"
      title={
        <>
          Plain answers for <span className="text-lime">legal</span>, security and brand.
        </>
      }
      subtitle="The pipeline, what the AI does and doesn't do, where your content goes, and the limits we know about."
      stats={[
        { label: "pipeline steps", value: 5 },
        { label: "AI on by default", value: ai?.ai ? 1 : 0, tone: "lime" },
        { label: "content stored on server", value: 0, tone: "violet" },
      ]}
      actions={
        <>
          <Link href="/submit?sample=launch" className={heroBtn}>
            Try a check →
          </Link>
          <Link href="/eval" className={heroBtnGhost}>
            Measured accuracy
          </Link>
        </>
      }
    />
    <div className="stagger mx-auto max-w-4xl space-y-6">

      <section className="card p-5">
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">The pipeline</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            <strong>Extract.</strong> Text is used as-is. PDFs are split into pages and their text extracted on the server in memory. Images are analysed in your browser:
            dominant colours (k-means), text via OCR (Tesseract), and the colour of each text line against its background.
          </li>
          <li>
            <strong>Rules first.</strong> Deterministic checks run on every piece: prices, customer numbers, discounts and offer dates against Approved Facts; a lexicon of
            regulated claim patterns; terminology; tagline and brand-name usage; exclamation, capitals and emoji limits per channel; hashtag readability; link text; alt
            text; WCAG contrast; palette distance (CIEDE2000). The same input and guideline version always gives the same result.
          </li>
          <li>
            <strong>Then the model, only where rules can&apos;t judge.</strong> The AI layer reads the content together with the guideline rules and approved facts, proposes
            tone and claim issues the rules missed, and drafts fixes for findings that have no drop-in replacement.
          </li>
          <li>
            <strong>Grounding guard.</strong> Each AI finding must name an active guideline rule and quote text that actually appears in the content. If it doesn&apos;t, it
            is thrown away and counted as rejected (you can see the count on every check). AI-drafted fixes are re-checked by the claim lexicon and dropped if they add a new
            unsupported claim. Full AI rewrites are re-checked by every rule before you see them.
          </li>
          <li>
            <strong>People decide.</strong> Every finding needs accept, edit or dismiss from the creator; dismissals need a reason. High-severity findings block submission
            until decided. A named reviewer approves. BrandLint never publishes or edits anything on its own.
          </li>
          <li>
            <strong>Learn.</strong> Dismissal reasons are aggregated per rule. Rules people keep overriding show up as guideline gaps, and the owner can rewrite them.
          </li>
        </ol>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">AI disclosure</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
          <li>
            Provider: <strong>{ai?.provider ?? "Google Gemini API"}</strong>
            {ai?.model ? (
              <>
                , model <code>{ai.model}</code>
              </>
            ) : null}
            . Status right now: {ai == null ? "checking…" : ai.ai ? "on" : "off (rule checks only)"}.
          </li>
          <li>Everything the model writes is labelled &ldquo;AI-suggested&rdquo; in purple. Rule-based findings are labelled &ldquo;Rule check&rdquo; or &ldquo;Image analysis&rdquo;.</li>
          <li>The model never sees other customers&apos; data: only the content being checked, the guideline rules, and the approved facts.</li>
          <li>If the model is down, slow or returns something invalid, the check still completes with rule findings and says so.</li>
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">Privacy and confidential material</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
          <li>
            <strong>Your workspace lives in your browser</strong> (localStorage). The server keeps no database of your content: checks are processed in memory and the result
            is returned to you.
          </li>
          <li>Images never leave your browser. Only the text read from them is sent for checking.</li>
          <li>
            <strong>Confidential mode</strong> (on the New check page) turns the AI layer off for a check, so the content goes only to BrandLint&apos;s own server and is not sent to
            any AI provider.
          </li>
          <li>
            Important: this demo uses a Gemini API key whose provider terms may allow inputs to be used to improve their services on free tiers. Don&apos;t paste real
            confidential material into the public demo; use confidential mode or a deployment with a paid, no-training API tier.
          </li>
          <li>Traffic is HTTPS. API keys stay on the server. Requests are size-limited and rate-limited.</li>
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">Accessibility of BrandLint itself</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
          <li>Keyboard navigable, with a skip link, visible focus and labelled controls. Highlights in the text can be focused and opened with Enter.</li>
          <li>Severity is shown as a word (HIGH / MEDIUM / LOW), never by colour alone.</li>
          <li>Colours were chosen to meet WCAG AA contrast for text.</li>
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">Known limits</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
          <li>Tone is subjective. The rule checks only catch measurable tone issues; the AI layer&apos;s tone judgements can be wrong, which is why they are suggestions.</li>
          <li>OCR is unreliable on busy, curved or stylised text. Findings from image text are capped at 80% confidence and say they came from OCR.</li>
          <li>Contrast is measured per text line by splitting its pixels into two colour groups; gradients and text over photos can confuse it.</li>
          <li>The claim word list misses claims phrased indirectly. See the Accuracy page for measured precision and recall.</li>
          <li>Without the AI layer (no API key, provider outage or confidential mode), the tone rule §2.1 and any imported guideline rules are not checked. Every check says when this happened.</li>
          <li>Logo detection, DOCX files and real accounts with sign-in are not built yet.</li>
          <li>The workspace is per browser, so a reviewer on another device won&apos;t see a creator&apos;s submission in this demo build.</li>
        </ul>
      </section>
    </div>
    </>
  );
}
