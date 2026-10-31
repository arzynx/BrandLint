"use client";

import { useMemo, useState } from "react";
import { useAiStatus } from "@/components/Shell";
import { computeInsights, GAP_MIN_DISMISS_RATE, GAP_MIN_OCCURRENCES, type RuleStat } from "@/lib/insights";
import { getState, log, setState, useStore } from "@/lib/store";
import { Spinner, Switch, toast, celebrate } from "@/components/fx";
import { PageHero, heroBtn } from "@/components/PageHero";


function Bars({ rows, format = (v: number) => String(v), max }: { rows: [string, number][]; format?: (v: number) => string; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r[1]));
  return (
    <ul className="space-y-1.5">
      {rows.map(([label, v], i) => (
        <li key={label} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-2 text-sm" title={`${label}: ${format(v)}`}>
          <span className="truncate text-ink first-letter:uppercase">{label}</span>
          <span className="h-3 rounded-r bg-paper" aria-hidden>
            <span className="bar-grow block h-3 rounded-r bg-teal" style={{ width: `${(v / m) * 100}%`, "--i": i } as React.CSSProperties} />
          </span>
          <span className="text-right tabular-nums text-muted">{format(v)}</span>
        </li>
      ))}
    </ul>
  );
}

function GapCard({ g }: { g: RuleStat }) {
  const ai = useAiStatus();
  const role = useStore((s) => s.role);
  const rule = useStore((s) => s.brand.rules.find((r) => r.id === g.key));
  const [draft, setDraft] = useState<string | null>(null);
  const [by, setBy] = useState<"ai" | "template">("template");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function suggest() {
    setBusy(true);
    const reasons = g.reasons.map((r) => r[0]);
    try {
      if (!ai?.ai) throw new Error("offline");
      const res = await fetch("/api/rule-suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clause: g.clause, reasons }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setDraft(j.clause);
      setBy("ai");
      toast("AI drafted a clearer rule from the dismissal reasons", { kind: "info" });
    } catch {
      setDraft(`${g.clause} Exception to consider: ${reasons[0] ?? "(add the most common case here)"}.`);
      setBy("template");
      toast("Drafted a clearer rule from the dismissal reasons", { kind: "info" });
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!draft || !rule) return;
    setState((s) => {
      const r = s.brand.rules.find((x) => x.id === g.key);
      if (!r) return;
      r.text = draft;
      s.brand.version += 1;
      log(s, "rewrote rule", `${r.section} ${r.title} after guideline-gap review (v${s.brand.version})`);
    });
    setSaved(true);
    toast(`Guideline updated to v${getState().brand.version}. Future checks quote the new clause.`, { kind: "success" });
    celebrate();
  }

  return (
    <article className="card lift border-medium/40 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="font-semibold">{g.title}</h3>
        <span className="text-xs text-muted">{g.ref}</span>
        <span className="ml-auto rounded bg-medium-soft px-2 py-0.5 text-xs font-semibold text-medium">
          dismissed {Math.round(g.dismissRate * 100)}% of {g.fixed + g.dismissed} decisions
        </span>
      </div>
      <p className="mt-2 text-sm text-ink/80">&ldquo;{g.clause}&rdquo;</p>
      <p className="mt-2 text-xs font-semibold text-muted">Why people dismissed it</p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {g.reasons.slice(0, 4).map(([r, n]) => (
          <li key={r}>
            <span className="tabular-nums text-muted">{n}×</span> {r}
          </li>
        ))}
      </ul>
      {role === "owner" && rule ? (
        <div className="mt-3">
          {!draft ? (
            <button className="btn" onClick={suggest} disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Drafting…
                </>
              ) : (
                "Draft a clearer rule"
              )}
            </button>
          ) : (
            <div className="space-y-2">
              <label className="label" htmlFor={`gap-${g.key}`}>
                Proposed clause {by === "ai" ? <span className="normal-case text-[#4a5e00]">(AI-suggested)</span> : <span className="normal-case">(template from dismissal reasons)</span>}
              </label>
              <textarea id={`gap-${g.key}`} className="input min-h-20" value={draft} onChange={(e) => setDraft(e.target.value)} />
              {saved ? (
                <p className="text-sm text-ok">Saved as guideline v{getState().brand.version}. Future checks quote the new clause.</p>
              ) : (
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={save}>
                    Update the guideline
                  </button>
                  <button className="btn" onClick={() => (setDraft(null), toast("Draft discarded", { kind: "info", ms: 1500 }))}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">{rule ? "Switch to Ananya (Brand owner) to rewrite this rule." : "Terminology rows are edited on the Guideline page."}</p>
      )}
    </article>
  );
}

export default function InsightsPage() {
  const all = useStore((s) => s.submissions);
  const brand = useStore((s) => s.brand);
  const showSample = useStore((s) => s.showSample);
  const subs = useMemo(() => all.filter((s) => showSample || !s.sample), [all, showSample]);
  const ins = useMemo(() => computeInsights(subs, brand), [subs, brand]);
  const hasSample = all.some((s) => s.sample);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Governance insights"
        title={
          <>
            Fix the content now. Fix the <span className="text-lime">rulebook</span> over time.
          </>
        }
        subtitle="What keeps going wrong, on which channel and team, and which rules people keep overriding."
        stats={[
          { label: "submissions", value: ins.submissions },
          { label: "findings", value: ins.totalFindings, tone: "violet" },
          { label: "clean first pass", value: Math.round(ins.firstPassCleanRate * 100), suffix: "%", tone: "lime" },
          { label: "guideline gaps", value: ins.gaps.length, tone: "flag" },
        ]}
        actions={
          <a href="#gaps" className={heroBtn}>
            See guideline gaps ↓
          </a>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        {hasSample && (
          <span className="ml-auto">
            <Switch
              checked={showSample}
              onChange={(v) => {
                setState((s) => void (s.showSample = v));
                toast(v ? "Including generated sample history" : "Showing only your own checks", { kind: "info", ms: 2000 });
              }}
              label={`Include sample history (${all.filter((s) => s.sample).length} generated submissions)`}
            />
          </span>
        )}
      </div>
      {showSample && hasSample && (
        <p className="rounded-md bg-medium-soft px-3 py-2 text-sm text-medium">
          Includes generated sample history so you can see what this page looks like after five weeks of use. Untick the box to see only your own checks.
        </p>
      )}

      <section id="gaps" className="scroll-mt-24">
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink">Guideline gaps</h2>
        <p className="mb-3 text-sm text-muted">
          Rules flagged at least {GAP_MIN_OCCURRENCES} times and dismissed in at least {GAP_MIN_DISMISS_RATE * 100}% of decisions. When many people override a rule, the rule is
          usually the problem, not the content.
        </p>
        {ins.gaps.length ? (
          <div className="stagger grid gap-3 lg:grid-cols-2">
            {ins.gaps.map((g) => (
              <GapCard key={g.key} g={g} />
            ))}
          </div>
        ) : (
          <p className="card p-4 text-sm text-muted">No gaps yet. They appear once rules have enough decisions.</p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="font-semibold">Rules broken most often</h2>
          <p className="mb-3 text-xs text-muted">Findings that were accepted or edited, so real issues</p>
          <Bars rows={ins.topBroken.map((r) => [r.title, r.fixed])} />
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">Dismissal rate by rule</h2>
          <p className="mb-3 text-xs text-muted">Share of decisions that were dismissals (rules with 3+ decisions)</p>
          <Bars
            rows={ins.allRules.filter((r) => r.fixed + r.dismissed >= 3).sort((a, b) => b.dismissRate - a.dismissRate).slice(0, 8).map((r) => [r.title, r.dismissRate])}
            format={(v) => `${Math.round(v * 100)}%`}
            max={1}
          />
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">Findings by team</h2>
          <Bars rows={ins.byTeam} />
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">Findings by channel</h2>
          <Bars rows={ins.byChannel} />
        </section>
        <section className="card p-4 lg:col-span-2">
          <h2 className="font-semibold">Findings per week</h2>
          <Bars rows={ins.weekly.map(([w, n]) => [`Week of ${new Date(w).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`, n])} />
        </section>
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Table view: every rule</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-1 pr-3">Rule</th>
                <th className="pr-3">Source</th>
                <th className="pr-3 text-right">Flagged</th>
                <th className="pr-3 text-right">Fixed</th>
                <th className="pr-3 text-right">Dismissed</th>
                <th className="text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {ins.allRules.map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <td className="py-1 pr-3">{r.title}</td>
                  <td className="pr-3 text-muted">{r.ref}</td>
                  <td className="pr-3 text-right tabular-nums">{r.occurrences}</td>
                  <td className="pr-3 text-right tabular-nums">{r.fixed}</td>
                  <td className="pr-3 text-right tabular-nums">{r.dismissed}</td>
                  <td className="text-right tabular-nums">{r.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
