"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { runCheck } from "@/lib/checkClient";
import { uid } from "@/lib/engine/util";
import { svgToPng } from "@/lib/image";
import { PEOPLE } from "@/lib/people";
import { SAMPLES, type Sample } from "@/lib/samples";
import { getState, log, setState, useStore } from "@/lib/store";
import { CHANNELS, type Channel, type Format, type Submission } from "@/lib/types";
import { PageHero } from "@/components/PageHero";
import { CheckProgress, Spinner, Switch, toast, useBusyCursor } from "@/components/fx";

const FORMAT_LABEL: Record<Format, string> = { text: "Text", pdf: "PDF document", image: "Image" };
const CHANNEL_LABEL: Record<Channel, string> = { instagram: "Instagram", website: "Website", email: "Email", print: "Print" };

function SubmitInner() {
  const router = useRouter();
  const params = useSearchParams();
  const role = useStore((s) => s.role);
  const useAI = useStore((s) => s.useAI);
  const [format, setFormat] = useState<Format>("text");
  const [channel, setChannel] = useState<Channel>("instagram");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedSample = useRef<string | null>(null);
  useBusyCursor(!!busy);

  async function loadSample(s: Sample) {
    setError(null);
    setFormat(s.format);
    setChannel(s.channel);
    setTitle(s.title);
    setAltText(s.altText ?? "");
    if (s.format === "text") {
      setText(s.text ?? "");
      setFile(null);
      setPreview(null);
    } else if (s.file) {
      try {
        const blob = s.file.endsWith(".svg") ? await svgToPng(s.file) : await (await fetch(s.file)).blob();
        setFile(blob);
        setFileName(s.file.split("/").pop()!.replace(".svg", ".png"));
        setPreview(s.format === "image" ? URL.createObjectURL(blob) : null);
      } catch {
        setError("Couldn't load the sample file.");
        return;
      }
    }
    toast(`Loaded sample: ${s.label}`, { kind: "info" });
  }

  useEffect(() => {
    const id = params.get("sample");
    if (id && loadedSample.current !== id) {
      loadedSample.current = id;
      const s = SAMPLES.find((x) => x.id === id);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s) void loadSample(s);
    }
  }, [params]);

  function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (format === "pdf" && f.type !== "application/pdf") return setError("That isn't a PDF.");
    if (format === "image" && !f.type.startsWith("image/")) return setError("That isn't an image.");
    if (f.size > 4 * 1024 * 1024) return setError("Files must be under 4 MB.");
    setFile(f);
    setFileName(f.name);
    setPreview(format === "image" ? URL.createObjectURL(f) : null);
    toast(`Attached ${f.name}`, { kind: "info" });
  }

  async function submit() {
    setError(null);
    setBusy("Starting…");
    try {
      const brand = getState().brand;
      const out = await runCheck({ format, channel, brand, useAI, text, file: file ?? undefined, altText, onProgress: setBusy });
      const now = new Date().toISOString();
      const author = PEOPLE[getState().role].name;
      const sub: Submission = {
        id: uid("sub"),
        title: title.trim() || (format === "text" ? text.trim().slice(0, 50) : fileName) || "Untitled",
        channel,
        team: PEOPLE[getState().role].team,
        author,
        format,
        status: "draft",
        image: out.thumb,
        altText: format === "image" ? altText : undefined,
        revisions: [{ n: 1, segments: out.segments, findings: out.findings, decisions: {}, meta: out.meta, createdAt: now, by: author }],
        comments: [],
        createdAt: now,
        updatedAt: now,
      };
      setState((s) => {
        s.submissions.unshift(sub);
        log(s, "submitted content", `"${sub.title}" (${FORMAT_LABEL[format]}, ${channel}): ${out.findings.length} findings`);
      });
      toast(out.findings.length ? `Check complete: ${out.findings.length} findings, each with its source` : "Check complete: no issues found", { kind: out.findings.length ? "info" : "success" });
      router.push(`/s/${sub.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      toast("The check didn't finish. See the message on the page.", { kind: "error" });
      setBusy(null);
    }
  }

  const ready = format === "text" ? text.trim().length > 0 : !!file;

  const brandNow = getState().brand;
  return (
    <>
    <PageHero
      eyebrow={`New check · guideline v${brandNow.version}`}
      title={
        <>
          Check it <span className="text-lime">before</span> it ships.
        </>
      }
      subtitle="Paste a caption, upload a PDF or drop in a banner. Rules run first, then the AI layer, and every finding quotes the clause it breaks."
      stats={[
        { label: "active rules", value: brandNow.rules.filter((r) => r.enabled).length, tone: "lime" },
        { label: "approved facts", value: brandNow.facts.length },
        { label: "terminology rows", value: brandNow.terms.length },
        { label: "formats", value: 3, tone: "violet" },
      ]}
    />
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="card p-5">
        <h2 className="text-xl font-semibold tracking-[-0.025em]">What are you publishing?</h2>
        <p className="mt-1 text-sm text-muted">
          Checked against <strong className="text-ink">Lumera Skin guideline v{brandNow.version}</strong>.
        </p>
        {role !== "creator" && (
          <p className="mt-3 rounded-md bg-low-soft px-3 py-2 text-sm text-low">
            You&apos;re acting as {PEOPLE[role].name}. Anyone can run a check, but submitting for review is usually done by a creator.
          </p>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label">Format</span>
            <div role="radiogroup" aria-label="Format" className="flex gap-1">
              {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
                <button
                  key={f}
                  role="radio"
                  aria-checked={format === f}
                  onClick={() => {
                    if (f !== format) toast(`Format: ${FORMAT_LABEL[f]}`, { kind: "info", ms: 1500 });
                    setFormat(f);
                    setFile(null);
                    setPreview(null);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm ${format === f ? "border-teal bg-teal-soft font-semibold text-teal" : "border-line bg-white text-muted"}`}
                >
                  {FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="channel">
              Channel
            </label>
            <select id="channel" className="input" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="title">
            Title (optional)
          </label>
          <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diwali offer post" />
        </div>

        {format === "text" ? (
          <div className="mt-4">
            <label className="label" htmlFor="text">
              Content
            </label>
            <textarea
              id="text"
              className="input min-h-56 font-[inherit] leading-relaxed"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a caption, email, web copy or ad text…"
              maxLength={8000}
            />
            <p className="mt-1 text-right text-xs text-muted">{text.length} / 8000</p>
          </div>
        ) : (
          <div className="mt-4">
            <span className="label">{format === "pdf" ? "PDF (max 4 MB, text-based)" : "Image (PNG or JPG, max 4 MB)"}</span>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-line bg-paper px-4 py-8 text-sm text-muted hover:border-teal">
              <input type="file" className="sr-only" accept={format === "pdf" ? "application/pdf" : "image/*"} onChange={(e) => onFile(e.target.files?.[0])} />
              {fileName ? <span className="font-medium text-ink">{fileName}</span> : <span>Click to choose a file</span>}
            </label>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Preview of the uploaded image" className="mt-3 max-h-64 rounded-md border border-line" />
            )}
            {format === "image" && (
              <div className="mt-4">
                <label className="label" htmlFor="alt">
                  Alt text
                </label>
                <input id="alt" className="input" value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Describe the image for screen-reader users" />
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button className="btn-primary" disabled={!ready || !!busy} onClick={submit}>
            {busy ? (
              <>
                <Spinner /> Checking…
              </>
            ) : (
              "Run checks"
            )}
          </button>
          <Switch
            checked={!useAI}
            onChange={(v) => {
              setState((s) => void (s.useAI = !v));
              toast(v ? "Confidential mode on: rule checks only, nothing goes to the AI provider" : "AI layer back on for new checks", { kind: "info" });
            }}
            label="Confidential mode"
            hint="(rules only, nothing sent to the AI provider)"
          />
        </div>
        {busy && <CheckProgress message={busy} useAI={useAI} />}
        {error && (
          <p className="mt-3 rounded-md bg-high-soft px-3 py-2 text-sm text-high" role="alert">
            {error}
          </p>
        )}
      </section>

      <aside className="space-y-4">
        <div className="card p-4">
          <h2 className="font-semibold">Try a sample</h2>
          <p className="mt-1 text-xs text-muted">Realistic content with planted issues, plus clean ones that should pass.</p>
          <ul className="stagger mt-3 space-y-1.5">
            {SAMPLES.map((s, i) => (
              <li key={s.id} style={{ "--i": i } as React.CSSProperties}>
                <button onClick={() => loadSample(s)} className="w-full rounded-md border border-line bg-white px-3 py-2 text-left text-sm transition hover:translate-x-1 hover:border-teal">
                  <span className="mr-1.5 rounded bg-paper px-1.5 py-0.5 text-[11px] font-semibold uppercase text-muted">{s.format}</span>
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4 text-sm text-muted">
          <h2 className="font-semibold text-ink">What gets checked</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Rules first: facts, prices, offer dates, claim words, terminology, tagline, brand name, emoji and hashtag rules.</li>
            <li>Images: palette distance (CIEDE2000), WCAG text contrast, alt text, plus OCR so text in images is checked too.</li>
            <li>Then the AI layer looks at tone and claims the rules can&apos;t catch, and drafts fixes. Its findings must cite a rule or they are thrown out.</li>
          </ul>
        </div>
      </aside>
    </div>
    </>
  );
}

export default function SubmitPage() {
  return (
    <Suspense>
      <SubmitInner />
    </Suspense>
  );
}
