// Dev probe: send the same review prompt the app sends and print timing + raw output.
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const key = env.GEMINI_API_KEY;
const model = process.argv[2] ?? "gemini-3.5-flash";
const level = process.argv[3] ?? "low";
const user = JSON.stringify({
  task: "Find tone and promotional-claim issues. Cite rules by id. excerpt must be verbatim.",
  rules: [
    { id: "R-2.1", rule: "Calm, expert tone. Avoid hype, shouting and pressure tactics." },
    { id: "R-2.3", rule: "Never describe skin as ugly, embarrassing, bad, dull or flawed." },
    { id: "R-4.3", rule: "Efficacy or endorsement claims need a substantiated approved fact." },
  ],
  content: [{ segmentId: "s1", text: "Our serum makes your skin look like a celebrity. Doctors love it. Shop before your friends notice how dull you look." }],
  output_format: { findings: [{ ruleId: "R-x.x", segmentId: "s1", excerpt: "verbatim", explanation: "", severity: "high|medium|low", confidence: 0.0, replacement: "" }] },
});
const t0 = Date.now();
const body = {
  systemInstruction: { parts: [{ text: "You are a brand-compliance reviewer. Respond with JSON only." }] },
  contents: [{ role: "user", parts: [{ text: user }] }],
  generationConfig: { responseMimeType: "application/json", temperature: 0.2, ...(level !== "none" ? { thinkingConfig: { thinkingLevel: level } } : {}) },
};
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) });
const j = await res.json();
console.log(model, level, res.status, Date.now() - t0, "ms");
console.log(JSON.stringify(j).slice(0, 1500));
