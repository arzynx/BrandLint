"use client";

import { useState } from "react";
import type { Decision, Finding } from "@/lib/types";
import { CATEGORY_LABEL, SeverityBadge } from "./ui";

const ORIGIN: Record<Finding["origin"], [string, string]> = {
  rule: ["Rule check", "bg-teal-soft text-teal"],
  ai: ["AI-suggested", "bg-lime/30 text-[#3d4f00]"],
  vision: ["Image analysis", "bg-teal-soft text-teal"],
};

const QUICK_REASONS = ["Intentional, approved by legal", "False positive: the rule doesn't apply here", "Quoting a customer or third party", "Will fix in the design file"];

export function FindingCard({
  i = 0,
  f,
  decision,
  active,
  canDecide,
  onDecide,
  onUndo,
  onFocus,
}: {
  i?: number;
  f: Finding;
  decision?: Decision;
  active?: boolean;
  canDecide: boolean;
  onDecide: (d: Omit<Decision, "by" | "at">) => void;
  onUndo: () => void;
  onFocus?: () => void;
}) {
  const [mode, setMode] = useState<"none" | "edit" | "dismiss">("none");
  const [edit, setEdit] = useState(f.suggestion ?? f.excerpt ?? "");
  const [reason, setReason] = useState("");
  const [origin, originCls] = ORIGIN[f.origin];

  return (
    <article
      id={`finding-${f.id}`}
      onClick={onFocus}
      style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
      className={`card lift p-3.5 ${active ? "ring-2 ring-coral" : ""} ${decision ? "opacity-75" : ""}`}
      aria-label={`${f.severity} severity: ${f.title}`}
    >
      <header className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge s={f.severity} />
        <span className="text-xs font-semibold text-muted">{CATEGORY_LABEL[f.category]}</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${originCls}`}>{origin}</span>
        <span className="ml-auto text-xs text-muted" data-cursor="help" title="How sure the checker is. Exact rule matches score high; OCR and AI findings are capped lower. Below 60% goes under 'Worth a look'.">
          confidence {Math.round(f.confidence * 100)}%
        </span>
      </header>
      <h3 className="mt-2 text-[16px] font-semibold leading-snug tracking-[-0.015em]">{f.title}</h3>
      <p className="mt-0.5 text-sm text-ink/90">{f.message}</p>

      <blockquote className="mt-2 border-l-2 border-violet bg-[#f6f4ff] px-2.5 py-1.5 text-xs" data-cursor="help" title="The exact guideline clause or approved fact this finding is based on">
        <span className="font-mono text-[11px] font-medium text-violet-deep">{f.source.ref}</span>
        <span className="block text-ink/80">&ldquo;{f.source.quote}&rdquo;</span>
      </blockquote>

      {f.excerpt && f.suggestion != null && (
        <div className="mt-2 text-sm">
          <span className="text-xs font-semibold text-muted">
            Suggested fix{f.suggestionBy === "ai" && <span className="ml-1 font-medium text-[#4a5e00]">(AI-suggested)</span>}:
          </span>
          <div className="mt-0.5 rounded-md bg-paper px-2 py-1">
            <del className="text-high">{f.excerpt}</del> <span className="text-muted">→</span>{" "}
            <ins className="font-medium text-ok no-underline">{f.suggestion || "(remove)"}</ins>
          </div>
        </div>
      )}
      {f.advice && <p className="mt-2 text-sm text-muted">💡 {f.advice}</p>}

      {decision ? (
        <div className="pop-in mt-3 flex flex-wrap items-center gap-2 rounded-md bg-paper px-2.5 py-1.5 text-sm">
          <span className={`font-semibold ${decision.action === "dismissed" ? "text-medium" : "text-ok"}`}>
            {decision.action === "accepted" ? "Accepted" : decision.action === "edited" ? "Edited" : "Dismissed"}
          </span>
          <span className="text-muted">by {decision.by}</span>
          {decision.reason && <span className="w-full text-xs text-muted">Reason: {decision.reason}</span>}
          {decision.editedText != null && <span className="w-full text-xs text-muted">New text: &ldquo;{decision.editedText}&rdquo;</span>}
          {canDecide && (
            <button className="ml-auto text-xs underline" onClick={onUndo}>
              Undo
            </button>
          )}
        </div>
      ) : canDecide ? (
        <div className="mt-3">
          {mode === "none" && (
            <div className="flex flex-wrap gap-1.5">
              <button className="btn" onClick={() => onDecide({ action: "accepted" })}>
                {f.excerpt && f.suggestion != null ? "Accept fix" : "Acknowledge"}
              </button>
              {f.excerpt && (
                <button className="btn" onClick={() => setMode("edit")}>
                  Edit
                </button>
              )}
              <button className="btn" onClick={() => setMode("dismiss")}>
                Dismiss…
              </button>
            </div>
          )}
          {mode === "edit" && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                onDecide({ action: "edited", editedText: edit });
                setMode("none");
              }}
            >
              <label className="label" htmlFor={`edit-${f.id}`}>
                Replace &ldquo;{f.excerpt}&rdquo; with
              </label>
              <input id={`edit-${f.id}`} className="input" value={edit} onChange={(e) => setEdit(e.target.value)} autoFocus />
              <div className="flex gap-1.5">
                <button className="btn-primary" type="submit">
                  Save edit
                </button>
                <button className="btn" type="button" onClick={() => setMode("none")}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {mode === "dismiss" && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!reason.trim()) return;
                onDecide({ action: "dismissed", reason: reason.trim() });
                setMode("none");
              }}
            >
              <label className="label" htmlFor={`reason-${f.id}`}>
                Why dismiss? (logged, and used to find unclear rules)
              </label>
              <div className="flex flex-wrap gap-1">
                {QUICK_REASONS.map((r) => (
                  <button type="button" key={r} className="rounded-full border border-line px-2 py-0.5 text-xs hover:border-teal" onClick={() => setReason(r)}>
                    {r}
                  </button>
                ))}
              </div>
              <input id={`reason-${f.id}`} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" autoFocus />
              <div className="flex gap-1.5">
                <button className="btn-primary" type="submit" disabled={!reason.trim()}>
                  Dismiss
                </button>
                <button className="btn" type="button" onClick={() => setMode("none")}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </article>
  );
}
