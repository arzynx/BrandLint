// Dev probe: run one check through the local app and print findings.
import { readFileSync } from "node:fs";
const ts = readFileSync("src/lib/brand/demo.ts", "utf8");
const brand = eval("(" + ts.slice(ts.indexOf("= {") + 2).replace(/;\s*$/, "") + ")");
const text = process.argv[2] ?? "India's #1 fastest-growing skincare brand, clinically proven to remove dark spots in 7 days. Our serum makes your skin look like a celebrity. Doctors love it. Shop before your friends notice how dull you look.";
const t0 = Date.now();
const r = await fetch((process.env.BASE ?? "http://localhost:3000") + "/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ segments: [{ id: "s1", label: "Text", text }], channel: "instagram", brand, useAI: true }) });
const j = await r.json();
console.log("ms", Date.now() - t0, JSON.stringify(j.meta));
for (const f of j.findings) console.log("-", f.origin.padEnd(5), (f.ruleId ?? "").padEnd(6), JSON.stringify(f.excerpt), "=>", f.suggestionBy ?? "", JSON.stringify(f.suggestion ?? ""));
