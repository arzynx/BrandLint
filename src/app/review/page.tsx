"use client";

import { useMemo } from "react";
import { SubmissionList } from "@/components/SubmissionList";
import { Empty } from "@/components/ui";
import { useStore } from "@/lib/store";
import { PageHero, heroBtnGhost } from "@/components/PageHero";
import Link from "next/link";


export default function ReviewPage() {
  const all = useStore((s) => s.submissions);
  const role = useStore((s) => s.role);
  const queue = useMemo(() => all.filter((s) => s.status === "in_review"), [all]);
  const recent = useMemo(() => all.filter((s) => !s.sample && (s.status === "approved" || s.status === "changes_requested")).slice(0, 8), [all]);

  return (
    <div className="space-y-6">

      <PageHero
        eyebrow="Review queue"
        title={
          <>
            Review by <span className="text-lime">exception</span>.
          </>
        }
        subtitle={
          <>
            Reviewers see only what was flagged, what the creator changed and why they dismissed anything. A named human signs off.
            {role !== "reviewer" && " Switch to Rahul (Reviewer) at the top right to approve."}
          </>
        }
        stats={[
          { label: "waiting", value: queue.length, tone: queue.length ? "lime" : "white" },
          { label: "approved", value: all.filter((s) => !s.sample && s.status === "approved").length },
          { label: "sent back", value: all.filter((s) => !s.sample && s.status === "changes_requested").length, tone: "flag" },
        ]}
        actions={
          <Link href="/submissions" className={heroBtnGhost}>
            All submissions
          </Link>
        }
      />
      {queue.length ? <SubmissionList items={queue} /> : <Empty>The queue is empty. When a creator submits content for review, it appears here.</Empty>}
      {recent.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold">Recently decided</h2>
          <SubmissionList items={recent} />
        </div>
      )}
    </div>
  );
}
