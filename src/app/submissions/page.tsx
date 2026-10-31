"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SubmissionList } from "@/components/SubmissionList";
import { Empty } from "@/components/ui";
import { setState, useStore } from "@/lib/store";
import { Switch, toast } from "@/components/fx";
import { PageHero, heroBtn } from "@/components/PageHero";

import type { Status } from "@/lib/types";

const FILTERS: { key: Status | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "in_review", label: "In review" },
  { key: "changes_requested", label: "Changes requested" },
  { key: "approved", label: "Approved" },
];

export default function SubmissionsPage() {
  const all = useStore((s) => s.submissions);
  const showSample = useStore((s) => s.showSample);
  const [filter, setFilter] = useState<Status | "all">("all");
  const items = useMemo(() => all.filter((s) => (showSample || !s.sample) && (filter === "all" || s.status === filter)), [all, showSample, filter]);

  return (
    <div>
      <PageHero
        eyebrow="Submissions"
        title="Everything that went through BrandLint."
        subtitle="Every check, every revision and every decision, with who made it and why."
        stats={[
          { label: "total", value: all.filter((s) => showSample || !s.sample).length },
          { label: "in review", value: all.filter((s) => s.status === "in_review").length, tone: "violet" },
          { label: "needs changes", value: all.filter((s) => (showSample || !s.sample) && s.status === "changes_requested").length, tone: "flag" },
          { label: "approved", value: all.filter((s) => (showSample || !s.sample) && s.status === "approved").length, tone: "lime" },
        ]}
        actions={
          <Link href="/submit" className={heroBtn}>
            New check →
          </Link>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={`rounded-full border px-3 py-1 text-sm transition-colors ${filter === f.key ? "border-teal bg-teal-soft font-semibold text-teal" : "border-line bg-white"}`}>
            {f.label}
          </button>
        ))}
        <span className="ml-auto">
          <Switch
            checked={showSample}
            onChange={(v) => {
              setState((s) => void (s.showSample = v));
              toast(v ? "Showing sample history" : "Hiding sample history", { kind: "info", ms: 1800 });
            }}
            label="Show sample history"
          />
        </span>
      </div>
      {items.length ? <SubmissionList key={filter + String(showSample)} items={items} /> : <Empty>Nothing here yet. Run a check from “New check”.</Empty>}
    </div>
  );
}
