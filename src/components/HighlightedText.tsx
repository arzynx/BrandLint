"use client";

import type { Decision, Finding } from "@/lib/types";

/** Renders text with non-overlapping highlights for findings that point at an excerpt. */
export function HighlightedText({
  text,
  findings,
  decisions,
  activeId,
  onPick,
}: {
  text: string;
  findings: Finding[];
  decisions: Record<string, Decision>;
  activeId?: string | null;
  onPick: (id: string) => void;
}) {
  const marks = findings
    .filter((f) => f.start != null && f.end != null && f.end > f.start)
    .sort((a, b) => a.start! - b.start! || b.end! - a.end!);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const f of marks) {
    if (f.start! < pos) continue;
    if (f.start! > pos) parts.push(text.slice(pos, f.start!));
    const done = !!decisions[f.id];
    parts.push(
      <mark
        key={f.id}
        tabIndex={0}
        role="button"
        aria-label={`${f.severity} finding: ${f.title}`}
        className={`hl ${done ? "hl-done" : `hl-${f.severity}`} ${activeId === f.id ? "hl-active" : ""}`}
        onClick={() => onPick(f.id)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(f.id))}
        title={f.title}
      >
        {text.slice(f.start!, f.end!)}
      </mark>,
    );
    pos = f.end!;
  }
  parts.push(text.slice(pos));
  return <p className="whitespace-pre-wrap text-[15px] leading-7">{parts}</p>;
}
