"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { FindingCard } from "@/components/FindingCard";
import { HighlightedText } from "@/components/HighlightedText";
import { useAiStatus } from "@/components/Shell";
import { Diff, StatusBadge, timeAgo } from "@/components/ui";
import { checkSegments, contextOf, localToday, runCheck } from "@/lib/checkClient";
import { applyDecisions, blockingFindings, diffWords, openFindings } from "@/lib/draft";
import { uid } from "@/lib/engine/util";
import { PEOPLE, ROLE_LABEL } from "@/lib/people";
import { getState, log, setState, useStore } from "@/lib/store";
import type { Decision, Finding, Revision, Segment, Status, Submission } from "@/lib/types";
import { celebrate, CheckProgress, CountUp, Spinner, toast, useBusyCursor } from "@/components/fx";
import { brandScore, ScoreGauge } from "@/components/motion";

function addEvent(s: Submission, text: string) {
  const st = getState();
  s.events = [...(s.events ?? []), { at: new Date().toISOString(), actor: PEOPLE[st.role].name, role: st.role, text }];
  s.updatedAt = new Date().toISOString();
}

/** Carry earlier dismissals forward so people aren't asked the same question twice. */
function carryDismissals(prev: Revision, findings: Finding[], by: string): Record<string, Decision> {
  const out: Record<string, Decision> = {};
  for (const f of findings) {
    const old = prev.findings.find(
      (p) => p.ruleId === f.ruleId && p.excerpt && p.excerpt === f.excerpt && prev.decisions[p.id]?.action === "dismissed",
    );
    if (old) {
      out[f.id] = { action: "dismissed", reason: `${prev.decisions[old.id].reason} (carried over from revision ${prev.n})`, by, at: new Date().toISOString() };
    }
  }
  return out;
}

export default function SubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const sub = useStore((s) => s.submissions.find((x) => x.id === id));
  const role = useStore((s) => s.role);
  const useAI = useStore((s) => s.useAI);
  const ai = useAiStatus();
  const [revN, setRevN] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [rewrite, setRewrite] = useState<{ text: string; remaining: Finding[] } | null>(null);
  useBusyCursor(!!busy);

  const latest = sub?.revisions[sub.revisions.length - 1];
  const rev = sub?.revisions.find((r) => r.n === revN) ?? latest;
  const isLatest = rev?.n === latest?.n;

  const drafts = useMemo(() => {
    if (!rev) return {} as Record<string, string>;
    return Object.fromEntries(rev.segments.map((seg) => [seg.id, manual[seg.id] ?? applyDecisions(seg, rev.findings, rev.decisions)]));
  }, [rev, manual]);

  if (!sub || !rev || !latest) {
    return (
      <div className="card p-8 text-center">
        <p>This submission doesn&apos;t exist in your workspace.</p>
        <Link href="/submissions" className="mt-3 inline-block underline">
          Back to submissions
        </Link>
      </div>
    );
  }

  const editableStatus = sub.status === "draft" || sub.status === "changes_requested";
  const canDecide = isLatest && editableStatus && role === "creator" && !sub.sample;
  const textSegs = rev.segments.filter((s) => s.id !== "img");
  const changed = textSegs.some((s) => drafts[s.id] !== s.text);
  const open = openFindings(rev);
  const blocking = blockingFindings(rev);
  const counts = { high: 0, medium: 0, low: 0 };
  rev.findings.forEach((f) => counts[f.severity]++);

  const update = (fn: (s: Submission) => void, audit?: [string, string]) =>
    setState((st) => {
      const s = st.submissions.find((x) => x.id === sub.id);
      if (!s) return;
      fn(s);
      if (audit) log(st, audit[0], audit[1]);
    });

  const decide = (f: Finding, d: Omit<Decision, "by" | "at">) => {
    const label = d.action === "accepted" ? (f.suggestion != null && f.excerpt ? "Fix accepted" : "Acknowledged") : d.action === "edited" ? "Edit saved" : "Finding dismissed, reason logged";
    toast(`${label}: ${f.title}`, { kind: d.action === "dismissed" ? "warn" : "success", action: { label: "Undo", run: () => undo(f, true) } });
    update(
      (s) => {
        const r = s.revisions[s.revisions.length - 1];
        r.decisions[f.id] = { ...d, by: PEOPLE[getState().role].name, at: new Date().toISOString() };
      },
      [`${d.action} finding`, `${f.title} on "${sub.title}"${d.reason ? `: ${d.reason}` : ""}`],
    );
  };
  function undo(f: Finding, quiet = false) {
    update((s) => {
      delete s.revisions[s.revisions.length - 1].decisions[f.id];
    });
    toast(quiet ? "Undone" : `Decision undone: ${f.title}`, { kind: "info", ms: quiet ? 1500 : 3200 });
  }

  function pick(id: string) {
    setActiveId(id);
    document.getElementById(`finding-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function recheck(file?: File) {
    setError(null);
    setBusy("Re-checking…");
    try {
      const brand = getState().brand;
      let segments: Segment[];
      let findings: Finding[];
      let meta: Revision["meta"];
      let thumb: string | undefined;
      if (file) {
        const out = await runCheck({ format: "image", ...contextOf(sub!), brand, useAI, file, altText: sub!.altText, onProgress: setBusy });
        ({ segments, findings, meta, thumb } = out);
      } else {
        segments = rev!.segments.map((s) => ({ ...s, text: s.id === "img" ? s.text : drafts[s.id] }));
        const toCheck = segments.filter((s) => s.id !== "img" && s.text.trim());
        const r = toCheck.length ? await checkSegments(toCheck, contextOf(sub!), brand, useAI) : { findings: [], meta: rev!.meta };
        // keep image-level findings that the creator hasn't resolved by a new upload
        const visual = rev!.findings.filter((f) => f.segmentId === "img");
        findings = [...visual, ...r.findings];
        meta = r.meta;
      }
      const by = PEOPLE[getState().role].name;
      const carried = carryDismissals(rev!, findings, by);
      if (!file) for (const f of findings.filter((x) => x.segmentId === "img")) if (rev!.decisions[f.id]) carried[f.id] = rev!.decisions[f.id];
      update(
        (s) => {
          s.revisions.push({ n: s.revisions.length + 1, segments, findings, decisions: carried, meta, createdAt: new Date().toISOString(), by });
          if (thumb) s.image = thumb;
          if (s.status === "changes_requested") s.status = "draft";
          addEvent(s, `Created revision ${s.revisions.length}: ${findings.length} findings`);
        },
        ["re-checked", `"${sub!.title}" revision ${sub!.revisions.length + 1}: ${findings.length} findings`],
      );
      setManual({});
      setRewrite(null);
      setRevN(null);
      toast(`Revision ${sub!.revisions.length + 1} checked: ${findings.length} findings (${Object.keys(carried).length} decisions carried over)`, { kind: findings.length ? "info" : "success" });
      if (!findings.length) celebrate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-check failed");
      toast("Re-check failed", { kind: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function aiRewrite() {
    const seg = textSegs[0];
    setError(null);
    setBusy("Asking the AI layer for a full rewrite…");
    try {
      const issues = rev!.findings
        .filter((f) => rev!.decisions[f.id]?.action !== "dismissed")
        .map((f) => `${f.title}: ${f.message}${f.excerpt ? ` (text: "${f.excerpt}")` : ""}`);
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: drafts[seg.id], ...contextOf(sub!), brand: getState().brand, issues, today: localToday() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Rewrite failed");
      setRewrite({ text: j.rewrite, remaining: j.remaining });
      toast("AI rewrite ready. Review the changes before using it.", { kind: "info" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rewrite failed");
      toast("AI rewrite failed. Rule-based fixes still work.", { kind: "error" });
    } finally {
      setBusy(null);
    }
  }

  function setStatus(status: Status, text: string, commentText?: string, from?: Element | null) {
    const msg: Record<Status, [string, "success" | "info" | "warn"]> = {
      in_review: ["Submitted for review. It is now in the reviewer's queue.", "success"],
      approved: ["Approved and signed off. Ready to publish.", "success"],
      changes_requested: ["Changes requested. Sent back to the creator.", "warn"],
      draft: ["Back to draft", "info"],
    };
    toast(msg[status][0], { kind: msg[status][1] });
    if (status === "approved" || status === "in_review") celebrate(from);
    update(
      (s) => {
        s.status = status;
        addEvent(s, text);
        if (commentText) {
          s.comments.push({ id: uid("c"), by: PEOPLE[getState().role].name, role: getState().role, text: commentText, at: new Date().toISOString(), revision: s.revisions.length });
        }
      },
      [text.toLowerCase(), `"${sub!.title}"${commentText ? `: ${commentText}` : ""}`],
    );
  }

  function addComment() {
    if (!comment.trim()) return;
    update(
      (s) => {
        s.comments.push({ id: uid("c"), by: PEOPLE[getState().role].name, role: getState().role, text: comment.trim(), at: new Date().toISOString(), revision: rev!.n });
      },
      ["commented", `on "${sub!.title}"`],
    );
    setComment("");
    toast("Comment posted", { kind: "success", ms: 1800 });
  }

  const sorted = [...rev.findings].sort((a, b) => Number(!!rev.decisions[a.id]) - Number(!!rev.decisions[b.id]));
  const firm = sorted.filter((f) => f.confidence >= 0.6);
  const worthALook = sorted.filter((f) => f.confidence < 0.6);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/submissions" className="text-sm text-muted hover:underline">
            ← Submissions
          </Link>
          <h1 className="mt-1 text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-ink">{sub.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusBadge s={sub.status} />
            <span className="capitalize">{sub.channel}</span>·<span className="uppercase">{sub.format}</span>·
            <span>
              {sub.author} ({sub.team})
            </span>
            ·<span>{timeAgo(sub.createdAt)}</span>
            {sub.sample && <span className="rounded bg-[#E9E8F2] px-1.5 text-xs">sample history</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Revisions">
          {sub.revisions.map((r) => (
            <button
              key={r.n}
              role="tab"
              aria-selected={r.n === rev.n}
              onClick={() => {
                setRevN(r.n);
                setManual({});
                setRewrite(null);
              }}
              className={`rounded-md border px-2.5 py-1 text-sm ${r.n === rev.n ? "border-teal bg-teal-soft font-semibold text-teal" : "border-line bg-white"}`}
            >
              Rev {r.n} <span className="text-xs text-muted">({r.findings.length})</span>
            </button>
          ))}
        </div>
      </div>

      {/* summary strip */}
      <div className="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
        <ScoreGauge score={brandScore(rev.findings, rev.decisions)} label="Brand-safety score" size={76} />
        <span>
          <strong className="text-high">
            <CountUp value={counts.high} />
          </strong>{" "}
          high ·{" "}
          <strong className="text-medium">
            <CountUp value={counts.medium} />
          </strong>{" "}
          medium ·{" "}
          <strong className="text-low">
            <CountUp value={counts.low} />
          </strong>{" "}
          low
        </span>
        <span className="flex items-center gap-2">
          <strong>{rev.findings.length - open.length}</strong> of {rev.findings.length} decided
          <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-paper" aria-hidden>
            <span
              className="block h-full rounded-full bg-ok transition-[width] duration-500"
              style={{ width: `${rev.findings.length ? ((rev.findings.length - open.length) / rev.findings.length) * 100 : 100}%` }}
            />
          </span>
        </span>
        <span className="text-muted">
          {rev.meta.aiStatus === "ok"
            ? `AI layer (${rev.meta.aiModel}): proposed ${rev.meta.aiProposed}, ${rev.meta.aiRejected} rejected by the grounding guard`
            : rev.meta.aiStatus === "error"
              ? `AI layer failed for this check${rev.meta.aiError ? ` (${rev.meta.aiError})` : ""}; rule checks ran normally`
              : `Rules only (AI layer off for this check)${getState().brand.rules.some((r) => r.enabled && r.id.startsWith("R-imp-")) ? "; imported rules and the tone rule (§2.1) were not checked" : "; the tone rule (§2.1) was not checked"}`}
        </span>
        {!isLatest && <span className="rounded bg-medium-soft px-2 py-0.5 text-medium">Viewing an older revision (read-only)</span>}
      </div>

      {rev.findings.length === 0 && (
        <div className="pop-in mb-4 rounded-lg border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok">
          ✓ No issues found against guideline v{getState().brand.version}. This content cites nothing that isn&apos;t approved.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* content */}
        <section className="space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          {rev.segments.map((seg) =>
            seg.id === "img" ? (
              <div key={seg.id} className="card p-4">
                <h2 className="label">Image</h2>
                {sub.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sub.image} alt={sub.altText || "Submitted image (no alt text provided)"} className="max-h-96 rounded-md border border-line" />
                ) : (
                  <p className="text-sm text-muted">Image not stored.</p>
                )}
                <p className="mt-2 text-sm">
                  <span className="text-muted">Alt text:</span> {sub.altText || <em className="text-high">none</em>}
                </p>
                {rev.findings
                  .filter((f) => f.segmentId === "img")
                  .map((f) => (
                    <button key={f.id} onClick={() => pick(f.id)} className={`mr-1.5 mt-2 rounded px-2 py-0.5 text-xs ${rev.decisions[f.id] ? "bg-ok-soft text-ok line-through" : "bg-medium-soft text-medium"}`}>
                      {f.title}
                    </button>
                  ))}
                {canDecide && (
                  <label className="btn mt-3 cursor-pointer">
                    Upload revised image
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && recheck(e.target.files[0])} />
                  </label>
                )}
              </div>
            ) : (
              <div key={`${seg.id}-${rev.n}`} className="card relative overflow-hidden p-4">
                <span className="scanline" aria-hidden />
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="label">{seg.label}</h2>
                  {canDecide && (
                    <button className="text-xs underline" onClick={() => {
                      if (editing === seg.id) toast("Manual edits kept in your draft", { kind: "info", ms: 1800 });
                      setEditing(editing === seg.id ? null : seg.id);
                    }}>
                      {editing === seg.id ? "Done editing" : "Edit text manually"}
                    </button>
                  )}
                </div>
                {editing === seg.id ? (
                  <textarea
                    className="input min-h-48 leading-relaxed"
                    value={drafts[seg.id]}
                    onChange={(e) => setManual((m) => ({ ...m, [seg.id]: e.target.value }))}
                    aria-label={`Edit ${seg.label}`}
                  />
                ) : (
                  <HighlightedText text={seg.text} findings={rev.findings.filter((f) => f.segmentId === seg.id)} decisions={rev.decisions} activeId={activeId} onPick={pick} />
                )}
              </div>
            ),
          )}

          {isLatest && changed && (
            <div className="card border-teal p-4">
              <h2 className="label">Your revised draft (changes from accepted fixes and edits)</h2>
              {textSegs.map((seg) =>
                drafts[seg.id] !== seg.text ? (
                  <div key={seg.id} className="mt-2">
                    {textSegs.length > 1 && <p className="text-xs font-semibold text-muted">{seg.label}</p>}
                    <Diff parts={diffWords(seg.text, drafts[seg.id])} />
                  </div>
                ) : null,
              )}
            </div>
          )}

          {canDecide && sub.format !== "image" && (
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" disabled={!!busy} onClick={() => recheck()}>
                {busy ? <Spinner /> : null} Re-check as revision {sub.revisions.length + 1}
              </button>
              {sub.format === "text" && ai?.ai && useAI && (
                <button className="btn" disabled={!!busy} onClick={aiRewrite}>
                  ✨ AI rewrite of the whole draft
                </button>
              )}
            </div>
          )}
          {busy && <CheckProgress message={busy} useAI={useAI} />}
          {error && (
            <p className="rounded-md bg-high-soft px-3 py-2 text-sm text-high" role="alert">
              {error}
            </p>
          )}

          {rewrite && (
            <div className="pop-in card border-[#b5e51f] p-4">
              <h2 className="label">
                AI-suggested rewrite <span className="normal-case text-[#4a5e00]">(review before using)</span>
              </h2>
              <Diff parts={diffWords(drafts[textSegs[0].id], rewrite.text)} />
              <p className={`mt-2 text-sm ${rewrite.remaining.length ? "text-medium" : "text-ok"}`}>
                Self-check with the rule engine:{" "}
                {rewrite.remaining.length
                  ? `${rewrite.remaining.length} rule issue(s) remain: ${rewrite.remaining.map((f) => f.title).join(", ")}`
                  : "passes every rule check."}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  className="btn-primary"
                  onClick={() => {
                    setManual({ [textSegs[0].id]: rewrite.text });
                    setRewrite(null);
                    toast("Rewrite applied to your draft. Re-check to confirm.", { kind: "success" });
                  }}
                >
                  Use this rewrite
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setRewrite(null);
                    toast("Rewrite discarded", { kind: "info", ms: 1500 });
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {/* workflow */}
          <div className="card p-4">
            <h2 className="font-semibold">Review workflow</h2>
            <ol className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {(["draft", "in_review", "approved"] as Status[]).map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  {i > 0 && <span className="text-muted">→</span>}
                  <span className={sub.status === s || (s === "draft" && sub.status === "changes_requested") ? "font-bold text-teal" : "text-muted"}>
                    {s === "draft" ? "Creator fixes" : s === "in_review" ? "Reviewer checks" : "Approved"}
                  </span>
                </li>
              ))}
            </ol>

            {sub.sample ? (
              <p className="mt-3 text-sm text-muted">This is sample history; actions are disabled.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {editableStatus && role === "creator" && (
                  <div>
                    <button
                      className="btn-primary"
                      disabled={blocking.length > 0 || changed || !isLatest}
                      onClick={(e) => setStatus("in_review", `Submitted revision ${latest.n} for review`, undefined, e.currentTarget)}
                    >
                      Submit for review
                    </button>
                    <p className="mt-1 text-xs text-muted">
                      {changed
                        ? "You have unsaved fixes. Re-check them first so the reviewer sees the final version."
                        : blocking.length > 0
                          ? `${blocking.length} high-severity finding(s) still need a decision.`
                          : `${open.length} lower-severity finding(s) open; the reviewer will see them.`}
                    </p>
                  </div>
                )}
                {editableStatus && role !== "creator" && <p className="text-sm text-muted">Waiting for the creator to resolve findings and submit.</p>}
                {sub.status === "in_review" && role === "reviewer" && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted">
                      Review by exception: {open.length} open, {Object.values(latest.decisions).filter((d) => d.action === "dismissed").length} dismissed by the creator (check the reasons).
                    </p>
                    <textarea className="input" placeholder="Comment (required to request changes)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Review comment" />
                    <div className="flex gap-2">
                      <button
                        className="btn-primary"
                        onClick={(e) => {
                          setStatus("approved", `Approved revision ${latest.n}`, comment.trim() || undefined, e.currentTarget);
                          setComment("");
                        }}
                      >
                        Approve
                      </button>
                      <button
                        className="btn"
                        disabled={!comment.trim()}
                        onClick={() => {
                          setStatus("changes_requested", `Requested changes on revision ${latest.n}`, comment.trim());
                          setComment("");
                        }}
                      >
                        Request changes
                      </button>
                    </div>
                  </div>
                )}
                {sub.status === "in_review" && role !== "reviewer" && <p className="text-sm text-muted">Waiting for a reviewer. Switch to Rahul (Reviewer) at the top to review.</p>}
                {sub.status === "approved" && <p className="text-sm text-ok">Approved. A named human signed off; BrandLint never publishes anything itself.</p>}
              </div>
            )}

            <h3 className="mt-5 text-sm font-semibold">Comments</h3>
            <ul className="mt-2 space-y-2">
              {sub.comments.length === 0 && <li className="text-sm text-muted">No comments yet.</li>}
              {sub.comments.map((c) => (
                <li key={c.id} className="rounded-md bg-paper px-3 py-2 text-sm">
                  <span className="font-semibold">{c.by}</span> <span className="text-xs text-muted">({ROLE_LABEL[c.role]}, rev {c.revision}, {timeAgo(c.at)})</span>
                  <p>{c.text}</p>
                </li>
              ))}
            </ul>
            {!sub.sample && !(sub.status === "in_review" && role === "reviewer") && (
              <div className="mt-2 flex gap-2">
                <input className="input" placeholder="Add a comment" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} aria-label="Add a comment" />
                <button className="btn" onClick={addComment} disabled={!comment.trim()}>
                  Post
                </button>
              </div>
            )}

            <h3 className="mt-5 text-sm font-semibold">History</h3>
            <ul className="mt-1 space-y-1 text-xs text-muted">
              <li>
                {timeAgo(sub.createdAt)}: {sub.author} created revision 1 ({sub.revisions[0].findings.length} findings)
              </li>
              {(sub.events ?? []).map((e, i) => (
                <li key={i}>
                  {timeAgo(e.at)}: {e.actor} ({ROLE_LABEL[e.role]}) {e.text.charAt(0).toLowerCase() + e.text.slice(1)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* findings */}
        <aside className="stagger space-y-3" aria-label="Findings" key={rev.n}>
          {!canDecide && isLatest && editableStatus && role !== "creator" && !sub.sample && (
            <p className="rounded-md bg-low-soft px-3 py-2 text-sm text-low">Switch to Priya (Creator) to accept, edit or dismiss findings.</p>
          )}
          {firm.map((f, i) => (
            <FindingCard i={i} key={f.id} f={f} decision={rev.decisions[f.id]} active={activeId === f.id} canDecide={canDecide} onDecide={(d) => decide(f, d)} onUndo={() => undo(f)} onFocus={() => setActiveId(f.id)} />
          ))}
          {worthALook.length > 0 && (
            <>
              <h2 className="pt-2 text-sm font-semibold text-muted">Worth a look (lower confidence)</h2>
              {worthALook.map((f, i) => (
                <FindingCard i={firm.length + i} key={f.id} f={f} decision={rev.decisions[f.id]} active={activeId === f.id} canDecide={canDecide} onDecide={(d) => decide(f, d)} onUndo={() => undo(f)} onFocus={() => setActiveId(f.id)} />
              ))}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
