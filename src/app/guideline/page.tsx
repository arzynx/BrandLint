"use client";

import { useState } from "react";
import { SeverityBadge, CATEGORY_LABEL, timeAgo } from "@/components/ui";
import { candidateToRule, extractCandidates, type Candidate } from "@/lib/importRules";
import { ROLE_LABEL } from "@/lib/people";
import { actor, log, resetWorkspace, setState, useStore } from "@/lib/store";
import type { Category, Claim, Severity } from "@/lib/types";
import { Spinner, Switch, toast, celebrate } from "@/components/fx";
import { useAiStatus } from "@/components/Shell";
import { PageHero, heroBtn, heroBtnGhost } from "@/components/PageHero";
import Link from "next/link";


type Tab = "rules" | "facts" | "terms" | "visual" | "import" | "audit";
const TABS: [Tab, string][] = [
  ["rules", "Rules"],
  ["facts", "Approved facts"],
  ["terms", "Terminology"],
  ["visual", "Palette & tagline"],
  ["import", "Import guideline"],
  ["audit", "Audit log"],
];

function bump(s: Parameters<Parameters<typeof setState>[0]>[0], action: string, detail: string) {
  s.brand.version += 1;
  log(s, action, `${detail} (guideline v${s.brand.version})`);
  const v = s.brand.version;
  setTimeout(() => toast(`${action.charAt(0).toUpperCase() + action.slice(1)}: ${detail}. Guideline is now v${v}.`, { kind: "success" }), 0);
}

export default function GuidelinePage() {
  const ai = useAiStatus();
  const brand = useStore((s) => s.brand);
  const role = useStore((s) => s.role);
  const audit = useStore((s) => s.audit);
  const [tab, setTab] = useState<Tab>("rules");
  const owner = role === "owner";

  return (
    <div>
      <PageHero
        eyebrow={`${brand.name} · guideline v${brand.version}`}
        title={
          <>
            One source of <span className="text-lime">truth</span>.
          </>
        }
        subtitle={
          owner
            ? "Rules, approved facts, terminology and palette. Every edit bumps the version and is logged, and every finding quotes this page."
            : "Read-only. Only the brand owner (Ananya) can edit rules. Switch roles at the top right to make changes."
        }
        stats={[
          { label: "version", value: brand.version, tone: "lime" },
          { label: "active rules", value: brand.rules.filter((r) => r.enabled).length },
          { label: "approved facts", value: brand.facts.length, tone: "violet" },
          { label: "terminology", value: brand.terms.length },
        ]}
        actions={
          owner ? (
            <button className={heroBtn} onClick={() => setTab("import")}>
              Import a guideline →
            </button>
          ) : (
            <Link href="/insights" className={heroBtnGhost}>
              See which rules confuse people
            </Link>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === k ? "border-violet text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "rules" && (
        <div className="stagger space-y-2">
          {brand.rules.map((r, i) => (
            <div key={r.id} style={{ "--i": Math.min(i, 14) } as React.CSSProperties} className={`card lift flex flex-wrap items-start gap-3 p-3 transition-opacity ${r.enabled ? "" : "opacity-60"}`}>
              <div className="w-16 shrink-0 font-mono text-sm font-semibold text-teal">{r.section}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.title}</span>
                  {r.id.startsWith("R-imp-") && (
                    <span
                      data-cursor="help"
                      title="Imported rules are written in plain language, so only the AI layer can check them."
                      className={`rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-medium ${ai?.ai ? "bg-lime/30 text-[#3d4f00]" : "bg-medium-soft text-medium"}`}
                    >
                      {ai?.ai ? "checked by AI layer" : "not checked: AI layer is off"}
                    </span>
                  )}
                  <SeverityBadge s={r.severity} />
                  <span className="text-xs text-muted">{CATEGORY_LABEL[r.category]}</span>
                </div>
                {owner ? (
                  <textarea
                    className="input mt-1 min-h-14 text-sm"
                    defaultValue={r.text}
                    aria-label={`Clause text for ${r.section}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== r.text)
                        setState((s) => {
                          s.brand.rules.find((x) => x.id === r.id)!.text = v;
                          bump(s, "edited rule", `${r.section} ${r.title}`);
                        });
                    }}
                  />
                ) : (
                  <p className="mt-1 text-sm text-ink/80">{r.text}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {owner && (
                  <select
                    className="rounded border border-line bg-white px-1 py-0.5 text-xs"
                    value={r.severity}
                    aria-label="Severity"
                    onChange={(e) =>
                      setState((s) => {
                        s.brand.rules.find((x) => x.id === r.id)!.severity = e.target.value as Severity;
                        bump(s, "changed severity", `${r.section} → ${e.target.value}`);
                      })
                    }
                  >
                    {["high", "medium", "low"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                )}
                <Switch
                  checked={r.enabled}
                  disabled={!owner}
                  label={<span className="text-xs">Active</span>}
                  onChange={(v) =>
                    setState((s) => {
                      s.brand.rules.find((x) => x.id === r.id)!.enabled = v;
                      bump(s, v ? "enabled rule" : "disabled rule", `${r.section} ${r.title}`);
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "facts" && <FactsTab owner={owner} />}
      {tab === "terms" && <TermsTab owner={owner} />}

      {tab === "visual" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-4">
            <h2 className="font-semibold">Palette</h2>
            <p className="text-xs text-muted">Colours in images are compared with these using CIEDE2000. ΔE above 12 counts as off-palette.</p>
            <ul className="mt-3 space-y-2">
              {brand.palette.map((p, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="h-8 w-8 rounded border border-line" style={{ background: p.hex }} aria-hidden />
                  <span className="flex-1 text-sm font-medium">{p.name}</span>
                  {owner ? (
                    <input
                      type="color"
                      value={p.hex}
                      aria-label={`${p.name} colour`}
                      onChange={(e) =>
                        setState((s) => {
                          s.brand.palette[i].hex = e.target.value.toUpperCase();
                        })
                      }
                      onBlur={() => setState((s) => bump(s, "edited palette", p.name))}
                    />
                  ) : (
                    <code className="text-xs">{p.hex}</code>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4">
            <h2 className="font-semibold">Tagline</h2>
            {owner ? (
              <input
                className="input mt-2"
                defaultValue={brand.tagline}
                aria-label="Tagline"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== brand.tagline)
                    setState((s) => {
                      s.brand.retiredTaglines.push(s.brand.tagline.replace(/\.$/, ""));
                      s.brand.tagline = v;
                      bump(s, "changed tagline", `"${v}"`);
                    });
                }}
              />
            ) : (
              <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{brand.tagline}</p>
            )}
            <h3 className="mt-4 text-sm font-semibold">Retired taglines</h3>
            <ul className="mt-1 list-disc pl-5 text-sm text-muted">
              {brand.retiredTaglines.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === "import" && <ImportTab owner={owner} />}

      {tab === "audit" && (
        <div className="card divide-y divide-line">
          {audit.length === 0 && <p className="p-4 text-sm text-muted">No activity yet in this workspace.</p>}
          {audit.map((a, i) => (
            <div key={i} className="flex flex-wrap gap-x-3 px-4 py-2 text-sm">
              <span className="w-24 shrink-0 text-xs text-muted">{timeAgo(a.at)}</span>
              <span className="font-medium">
                {a.actor} <span className="text-xs font-normal text-muted">({ROLE_LABEL[a.role]})</span>
              </span>
              <span>{a.action}</span>
              <span className="text-muted">{a.detail}</span>
            </div>
          ))}
          <div className="p-4">
            <button
              className="btn"
              onClick={() => {
                if (confirm("Reset this browser's workspace to the original demo? Your checks and edits will be deleted.")) {
                  resetWorkspace();
                  toast("Workspace reset to the original demo", { kind: "info" });
                }
              }}
            >
              Reset demo workspace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FactsTab({ owner }: { owner: boolean }) {
  const facts = useStore((s) => s.brand.facts);
  const claims = useStore((s) => s.brand.claims);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [supports, setSupports] = useState("");

  function add() {
    if (!label.trim() || !value.trim() || !source.trim()) return;
    setState((s) => {
      const id = `C-${String(s.brand.claims.length + 1).padStart(2, "0")}`;
      const c: Claim = {
        id,
        label: label.trim(),
        wording: value.trim(),
        kind: "efficacy",
        aliases: [],
        supports: supports.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
        evidence: source.trim(),
        status: "verified",
        owner: actor(s),
        verifiedAt: new Date().toISOString().slice(0, 10),
      };
      s.brand.claims.push(c);
      bump(s, "added registry claim", `${id} ${c.label}`);
    });
    setLabel("");
    setValue("");
    setSource("");
    setSupports("");
  }

  return (
    <div className="space-y-3">
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3">Approved wording</th>
              <th className="px-3">Type</th>
              <th className="px-3">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {facts.map((f) => (
              <tr key={f.id} className="border-t border-line align-top">
                <td className="px-3 py-2 font-mono text-xs font-semibold text-teal">{f.id}</td>
                <td className="px-3 py-2">
                  {f.value}
                  {f.validUntil && <p className="text-xs text-muted">Valid until {f.validUntil}</p>}
                </td>
                <td className="px-3 py-2 capitalize text-muted">{f.kind}</td>
                <td className="px-3 py-2 text-muted">{f.source}</td>
              </tr>
            ))}
            {claims.map((c) => (
              <tr key={c.id} className="border-t border-line align-top">
                <td className="px-3 py-2 font-mono text-xs font-semibold text-teal">{c.id}</td>
                <td className="px-3 py-2">
                  {c.wording}
                  {c.supports.length ? <p className="text-xs text-muted">Substantiates: {c.supports.join(", ")}</p> : null}
                  {c.validUntil && <p className="text-xs text-muted">Valid until {c.validUntil}</p>}
                </td>
                <td className="px-3 py-2 capitalize text-muted">
                  {c.kind} · {c.status}
                </td>
                <td className="px-3 py-2 text-muted">{c.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {owner && (
        <div className="card grid gap-2 p-4 md:grid-cols-2">
          <h2 className="font-semibold md:col-span-2">Add a substantiated claim</h2>
          <input className="input" placeholder="Label, e.g. Hydration study" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Fact label" />
          <input className="input" placeholder="Evidence / source (required)" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Evidence" />
          <input className="input md:col-span-2" placeholder="Approved wording, exactly as it may be published" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Approved wording" />
          <input className="input md:col-span-2" placeholder="Claim phrases it substantiates, comma-separated (e.g. 72-hour hydration)" value={supports} onChange={(e) => setSupports(e.target.value)} aria-label="Phrases" />
          <div>
            <button className="btn-primary" onClick={add} disabled={!label.trim() || !value.trim() || !source.trim()}>
              Add fact
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TermsTab({ owner }: { owner: boolean }) {
  const terms = useStore((s) => s.brand.terms);
  const [avoid, setAvoid] = useState("");
  const [prefer, setPrefer] = useState("");
  const [note, setNote] = useState("");
  function add() {
    if (!avoid.trim() || !prefer.trim()) return;
    setState((s) => {
      const id = `T-${String(s.brand.terms.length + 1).padStart(2, "0")}`;
      s.brand.terms.push({ id, avoid: avoid.split(",").map((x) => x.trim()).filter(Boolean), prefer: prefer.trim(), note: note.trim() || "Brand terminology.", severity: "low" });
      bump(s, "added terminology row", `${id}: ${avoid} → ${prefer}`);
    });
    setAvoid("");
    setPrefer("");
    setNote("");
  }
  return (
    <div className="space-y-3">
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3">Avoid</th>
              <th className="px-3">Prefer</th>
              <th className="px-3">Why</th>
              <th className="px-3"></th>
            </tr>
          </thead>
          <tbody>
            {terms.map((t, i) => (
              <tr key={t.id} className="border-t border-line align-top">
                <td className="px-3 py-2 font-mono text-xs text-teal">
                  {i + 1} ({t.id})
                </td>
                <td className="px-3 py-2 text-high">{t.avoid.join(", ")}</td>
                <td className="px-3 py-2 text-ok">{t.prefer}</td>
                <td className="px-3 py-2 text-muted">{t.note}</td>
                <td className="px-3 py-2">
                  {owner && (
                    <button
                      className="text-xs underline"
                      onClick={() =>
                        setState((s) => {
                          s.brand.terms = s.brand.terms.filter((x) => x.id !== t.id);
                          bump(s, "removed terminology row", t.id);
                        })
                      }
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {owner && (
        <div className="card grid gap-2 p-4 md:grid-cols-3">
          <input className="input" placeholder="Avoid (comma-separated)" value={avoid} onChange={(e) => setAvoid(e.target.value)} aria-label="Avoid" />
          <input className="input" placeholder="Prefer" value={prefer} onChange={(e) => setPrefer(e.target.value)} aria-label="Prefer" />
          <input className="input" placeholder="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Why" />
          <div>
            <button className="btn-primary" onClick={add} disabled={!avoid.trim() || !prefer.trim()}>
              Add row
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const SAMPLE_GUIDELINE = `1. Voice
1.1 Our voice is warm and precise. Never use sarcasm about a customer's skin.
1.2 Always address the reader as "you", never as "the user".
2. Claims
2.1 Do not compare our products with named competitors.
2.2 Any claim about SPF protection must state the SPF and PA rating together.
3. Visuals
3.1 The logo must always have clear space equal to the height of the "L".`;

function ImportTab({ owner }: { owner: boolean }) {
  const ai = useAiStatus();
  const [raw, setRaw] = useState("");
  const [cands, setCands] = useState<(Candidate & { keep: boolean })[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function fromPdf(file: File) {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/pdf", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast("Couldn't read that PDF", { kind: "error" });
      return setMsg(j.error ?? "Couldn't read the PDF.");
    }
    setRaw((j.pages as string[]).join("\n"));
    toast(`Read ${j.totalPages} page(s) from ${file.name}`, { kind: "info" });
  }

  function extract() {
    const c = extractCandidates(raw).map((x) => ({ ...x, keep: true }));
    setCands(c);
    setMsg(c.length ? null : "No rule-like sentences found. Rules usually contain words like must, never, always or avoid.");
    toast(c.length ? `Found ${c.length} candidate rules. Confirm the ones to keep.` : "No rule-like sentences found", { kind: c.length ? "info" : "warn" });
  }

  function addSelected() {
    const keep = cands.filter((c) => c.keep);
    setState((s) => {
      const base = s.brand.rules.filter((r) => r.id.startsWith("R-imp-")).length;
      keep.forEach((c, i) => s.brand.rules.push(candidateToRule(c, base + i + 1)));
      bump(s, "imported rules", `${keep.length} rules confirmed from an uploaded guideline`);
    });
    setMsg(
      ai?.ai
        ? `Added ${keep.length} rules. Imported rules are checked by the AI layer, which must quote them when it flags something.`
        : `Added ${keep.length} rules. Note: imported rules are only checked when the AI layer is on, and it is off right now, so these rules won't produce findings yet.`,
    );
    celebrate();
    setCands([]);
    setRaw("");
  }

  if (!owner) return <p className="card p-4 text-sm text-muted">Switch to Ananya (Brand owner) to import a guideline.</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card space-y-3 p-4">
        <h2 className="font-semibold">1. Paste or upload the guideline</h2>
        <textarea className="input min-h-56 text-sm" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Paste guideline text…" aria-label="Guideline text" />
        <div className="flex flex-wrap gap-2">
          <label className="btn cursor-pointer">
            {busy ? (
              <>
                <Spinner /> Reading…
              </>
            ) : (
              "Upload PDF"
            )}
            <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => e.target.files?.[0] && fromPdf(e.target.files[0])} />
          </label>
          <button className="btn" onClick={() => (setRaw(SAMPLE_GUIDELINE), toast("Sample guideline text loaded", { kind: "info", ms: 1800 }))}>
            Use sample text
          </button>
          <button className="btn-primary" onClick={extract} disabled={!raw.trim()}>
            Find rules
          </button>
        </div>
        {msg && <p className="text-sm text-teal">{msg}</p>}
      </div>
      <div className="card p-4">
        <h2 className="font-semibold">2. Confirm each rule</h2>
        <p className="text-xs text-muted">BrandLint finds sentences that read like rules (must, never, avoid…). Nothing is added until you confirm it.</p>
        {cands.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted">Candidates appear here.</p>
        ) : (
          <>
            <ul className="stagger mt-3 space-y-2">
              {cands.map((c, i) => (
                <li key={i} style={{ "--i": i } as React.CSSProperties} className={`rounded-md border p-2 text-sm transition-colors ${c.keep ? "border-teal/50 bg-teal-soft/30" : "border-line"}`}>
                  <label className="flex gap-2">
                    <input type="checkbox" checked={c.keep} onChange={(e) => setCands((cs) => cs.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />
                    <span>
                      <span className="font-mono text-xs text-teal">{c.section}</span> {c.text}
                      <span className="mt-1 flex gap-2 text-xs">
                        <select
                          value={c.category}
                          aria-label="Category"
                          onChange={(e) => setCands((cs) => cs.map((x, j) => (j === i ? { ...x, category: e.target.value as Category } : x)))}
                          className="rounded border border-line"
                        >
                          {Object.keys(CATEGORY_LABEL).map((k) => (
                            <option key={k} value={k}>
                              {CATEGORY_LABEL[k as Category]}
                            </option>
                          ))}
                        </select>
                        <select
                          value={c.severity}
                          aria-label="Severity"
                          onChange={(e) => setCands((cs) => cs.map((x, j) => (j === i ? { ...x, severity: e.target.value as Severity } : x)))}
                          className="rounded border border-line"
                        >
                          {["high", "medium", "low"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button className="btn-primary mt-3" onClick={addSelected} disabled={!cands.some((c) => c.keep)}>
              Add {cands.filter((c) => c.keep).length} confirmed rules
            </button>
          </>
        )}
      </div>
    </div>
  );
}
