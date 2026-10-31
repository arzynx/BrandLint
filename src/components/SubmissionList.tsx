"use client";

import Link from "next/link";
import type { Submission } from "@/lib/types";
import { StatusBadge, timeAgo } from "./ui";

export function SubmissionList({ items }: { items: Submission[] }) {
  return (
    <div className="card stagger divide-y divide-line overflow-hidden">
      {items.map((s, i) => {
        const r = s.revisions[s.revisions.length - 1];
        const high = r.findings.filter((f) => f.severity === "high").length;
        const open = r.findings.filter((f) => !r.decisions[f.id]).length;
        return (
          <Link key={s.id} href={`/s/${s.id}`} style={{ "--i": Math.min(i, 15) } as React.CSSProperties} className="group flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-paper">
            {s.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.image} alt="" className="h-10 w-10 rounded object-cover" />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded bg-paper text-[10px] font-bold uppercase text-muted">{s.format}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium transition-colors group-hover:text-teal">
                {s.title} {s.sample && <span className="ml-1 rounded bg-[#E9E8F2] px-1.5 text-[11px] font-normal text-muted">sample</span>}
              </p>
              <p className="text-xs text-muted">
                <span className="capitalize">{s.channel}</span> · {s.author} · {s.team} · rev {r.n} · {timeAgo(s.updatedAt)}
              </p>
            </div>
            <span className="text-xs text-muted">
              {r.findings.length} findings{high ? `, ${high} high` : ""}
              {open ? `, ${open} open` : ""}
            </span>
            <StatusBadge s={s.status} />
          </Link>
        );
      })}
    </div>
  );
}
