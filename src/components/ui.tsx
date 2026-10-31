"use client";

import type { Category, Severity, Status } from "@/lib/types";
import type { DiffPart } from "@/lib/draft";

export const SEV_STYLE: Record<Severity, string> = {
  high: "bg-high-soft text-high",
  medium: "bg-medium-soft text-medium",
  low: "bg-low-soft text-low",
};

export function SeverityBadge({ s }: { s: Severity }) {
  return <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] ${SEV_STYLE[s]}`}>{s}</span>;
}

const STATUS: Record<Status, [string, string]> = {
  draft: ["Draft", "bg-[#E9E8F2] text-muted"],
  in_review: ["In review", "bg-low-soft text-low"],
  changes_requested: ["Changes requested", "bg-medium-soft text-medium"],
  approved: ["Approved", "bg-ok-soft text-ok"],
};

export function StatusBadge({ s }: { s: Status }) {
  const [label, cls] = STATUS[s];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  claim: "Claim",
  fact: "Fact",
  terminology: "Terminology",
  messaging: "Messaging",
  tone: "Tone",
  visual: "Visual",
  accessibility: "Accessibility",
};

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function Diff({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((p, i) =>
        p.kind === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.kind === "add" ? (
          <ins key={i} className="bg-ok-soft text-ok no-underline">
            {p.text}
          </ins>
        ) : (
          <del key={i} className="bg-high-soft text-high">
            {p.text}
          </del>
        ),
      )}
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card px-6 py-10 text-center text-sm text-muted">{children}</div>;
}
