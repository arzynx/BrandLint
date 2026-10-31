"use client";

import { useMemo } from "react";
import { demoBrand } from "@/lib/brand/demo";
import { detectClaims, hasUnsupportedClaim } from "@/lib/engine/claims";
import { CLAIM_DATASET } from "@/lib/eval/claimsDataset";
import { CountUp } from "@/components/fx";
import { PageHero, heroBtnGhost } from "@/components/PageHero";


export default function EvalPage() {
  const r = useMemo(() => {
    const rows = CLAIM_DATASET.map((d) => ({ ...d, pred: hasUnsupportedClaim(d.text, demoBrand), hits: detectClaims(d.text, demoBrand) }));
    const tp = rows.filter((x) => x.label && x.pred).length;
    const fp = rows.filter((x) => !x.label && x.pred).length;
    const fn = rows.filter((x) => x.label && !x.pred).length;
    const tn = rows.filter((x) => !x.label && !x.pred).length;
    const precision = tp / Math.max(1, tp + fp);
    const recall = tp / Math.max(1, tp + fn);
    return { rows, tp, fp, fn, tn, precision, recall, f1: (2 * precision * recall) / Math.max(1e-9, precision + recall), accuracy: (tp + tn) / rows.length };
  }, []);
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Accuracy · measured live"
        title={
          <>
            Numbers, not <span className="text-lime">vibes</span>.
          </>
        }
        subtitle={
          <>
            The rule-based claim detector, measured on {r.rows.length} labelled marketing sentences, running in your browser on the same code that checks your content. This is
            the Round 2 baseline; Round 3 measures the AI layer too.
          </>
        }
        stats={[
          { label: "sentences", value: r.rows.length },
          { label: "caught", value: r.tp, tone: "lime" },
          { label: "missed", value: r.fn, tone: "flag" },
          { label: "false alarms", value: r.fp, tone: "violet" },
        ]}
        actions={
          <a href="#misses" className={heroBtnGhost}>
            See every miss ↓
          </a>
        }
      />

      <div className="stagger grid gap-3 sm:grid-cols-4">
        {[
          ["Precision", r.precision, "of flags were real claims"],
          ["Recall", r.recall, "of real claims were caught"],
          ["F1", r.f1, "balance of the two"],
          ["Accuracy", r.accuracy, `${r.tp + r.tn} of ${r.rows.length} correct`],
        ].map(([k, v, sub]) => (
          <div key={k as string} className="card lift p-4">
            <p className="eyebrow text-muted">{k as string}</p>
            <p className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.04em] tabular">
              <CountUp value={(v as number) * 100} format={(x) => `${Math.round(x)}%`} />
            </p>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-paper">
              <span className="bar-grow block h-full rounded-full bg-teal" style={{ width: pct(v as number) }} />
            </span>
            <p className="text-xs text-muted">{sub as string}</p>
          </div>
        ))}
      </div>

      <div id="misses" className="grid scroll-mt-24 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="card p-4">
          <h2 className="font-semibold">Confusion matrix</h2>
          <table className="mt-3 w-full text-center text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th></th>
                <th className="pb-1">Flagged</th>
                <th className="pb-1">Not flagged</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="py-2 text-left text-xs text-muted">Is a claim</th>
                <td className="pop-in rounded bg-ok-soft py-3 font-bold text-ok">{r.tp}</td>
                <td className="rounded bg-high-soft py-3 font-bold text-high">{r.fn}</td>
              </tr>
              <tr>
                <th className="py-2 text-left text-xs text-muted">Not a claim</th>
                <td className="rounded bg-high-soft py-3 font-bold text-high">{r.fp}</td>
                <td className="pop-in rounded bg-ok-soft py-3 font-bold text-ok">{r.tn}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            Misses are the bigger risk, so the AI layer exists to catch claims phrased in ways no word list can (&ldquo;Doctors love it&rdquo;). It is grounded on the same
            rules.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-4">
            <h2 className="font-semibold text-high">Missed claims ({r.fn})</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {r.rows
                .filter((x) => x.label && !x.pred)
                .map((x) => (
                  <li key={x.text}>&ldquo;{x.text}&rdquo;</li>
                ))}
            </ul>
          </div>
          <div className="card p-4">
            <h2 className="font-semibold text-high">False alarms ({r.fp})</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {r.rows
                .filter((x) => !x.label && x.pred)
                .map((x) => (
                  <li key={x.text}>
                    &ldquo;{x.text}&rdquo; <span className="text-xs text-muted">(matched: {x.hits.filter((h) => !h.supportedBy).map((h) => h.text).join(", ")})</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">All {r.rows.length} labelled sentences</summary>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="py-1">Sentence</th>
              <th>Label</th>
              <th>Detector</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.text} className="border-t border-line">
                <td className="py-1 pr-3">{x.text}</td>
                <td>{x.label ? "claim" : "ok"}</td>
                <td className={x.label === x.pred ? "text-ok" : "font-semibold text-high"}>{x.pred ? "flagged" : "passed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="text-xs text-muted">
        Labels were written for this project with AI assistance (disclosed in the README), after the detector was built, and the detector was not tuned on this set. Sentences covered by an approved fact (for example the 2024 consumer study) are labelled &ldquo;not a claim&rdquo; because the
        guideline allows them.
      </p>
    </div>
  );
}
