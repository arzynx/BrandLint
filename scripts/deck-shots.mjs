// Captures screenshots of the live app for the Round 2 deck.
import { chromium } from "playwright";
const BASE = process.argv[2] ?? "https://brandlint.vercel.app";
const OUT = process.argv[3] ?? "D:/Projects/brandlint-deck/shots";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
await p.goto(BASE); await p.waitForTimeout(8200); await shot("home");
// text check
await p.goto(BASE + "/submit?sample=launch");
await p.waitForFunction(() => document.querySelector("textarea#text")?.value.length > 20);
await p.getByRole("button", { name: "Run checks" }).click();
await p.waitForURL(/\/s\//, { timeout: 90000 }); await p.waitForTimeout(2500);
await p.evaluate(() => window.scrollTo(0, 60)); await p.waitForTimeout(400); await shot("submission");
// accept two fixes for a "fixing" shot
for (let i = 0; i < 3; i++) await p.getByRole("button", { name: /^Accept fix$/ }).first().click();
await p.waitForTimeout(700); await p.evaluate(() => window.scrollTo(0, 60)); await shot("fixing");
// image check
await p.goto(BASE + "/submit?sample=banner");
await p.getByText("festive-banner.png").waitFor({ timeout: 30000 });
await p.getByRole("button", { name: "Run checks" }).click();
await p.waitForURL(/\/s\//, { timeout: 180000 }); await p.waitForTimeout(2500);
await p.evaluate(() => window.scrollTo(0, 60)); await shot("image");
// pdf check
await p.goto(BASE + "/submit?sample=flyer");
await p.getByText("popup-flyer.pdf").waitFor({ timeout: 30000 });
await p.getByRole("button", { name: "Run checks" }).click();
await p.waitForURL(/\/s\//, { timeout: 90000 }); await p.waitForTimeout(2500);
await p.evaluate(() => window.scrollTo(0, 60)); await shot("pdf");
// insights, eval, guideline
await p.goto(BASE + "/insights"); await p.waitForTimeout(2200); await p.evaluate(() => window.scrollTo(0, 330)); await p.waitForTimeout(500); await shot("insights");
await p.goto(BASE + "/eval"); await p.waitForTimeout(2200); await shot("eval");
const evalText = await p.locator("main").innerText();
await p.goto(BASE + "/guideline"); await p.waitForTimeout(1800); await shot("guideline");
await p.goto(BASE + "/review"); await p.waitForTimeout(1500); await shot("review");
console.log(evalText.split("\n").filter((l) => /^\d+%?$|Precision|Recall|F1|Accuracy|sentences|caught|missed|false alarms/i.test(l)).slice(0, 30).join(" | "));
await b.close();
