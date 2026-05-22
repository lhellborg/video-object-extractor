import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = "http://localhost:5173/";
const VIDEO_3GP = "/Users/lihel5/playground/video_detection/video0000.3gp";
const VIDEO_MP4 = "/Users/lihel5/playground/video_detection/video0000_short.mp4";
const OUT = "/tmp/verify_artifacts";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

console.log("→ navigating to", URL);
await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });

// ─── PHASE A: drop 3GP, expect convert button to appear ──────────────────────
console.log("\n=== PHASE A: 3GP error + convert button ===");
await page.setInputFiles("#file-input", VIDEO_3GP);
await page.waitForFunction(
  () => !document.getElementById("convert-btn").hidden,
  null,
  { timeout: 10000 },
);
const a_status = await page.locator("#status-msg").textContent();
const a_convertHidden = await page.locator("#convert-btn").evaluate((el) => el.hidden);
const a_startDisabled = await page.locator("#start-btn").isDisabled();
await page.screenshot({ path: `${OUT}/A_convert_offered.png`, fullPage: true });
console.log("status:", a_status);
console.log("convert hidden:", a_convertHidden);
console.log("start disabled:", a_startDisabled);

// ─── PHASE B: click Convert, wait for Ready ──────────────────────────────────
console.log("\n=== PHASE B: click Convert, wait for ffmpeg + reload ===");
await page.click("#convert-btn");
// Poll state every 5s so we can see if it's stuck
const startedAt = Date.now();
const maxMs = 3 * 60 * 1000;
let lastStatus = "";
let lastBtnText = "";
while (Date.now() - startedAt < maxMs) {
  const status = (await page.locator("#status-msg").textContent()) ?? "";
  const btnText = (await page.locator("#convert-btn").textContent()) ?? "";
  if (status !== lastStatus || btnText !== lastBtnText) {
    console.log(`  [${Math.round((Date.now() - startedAt) / 1000)}s] status="${status}" btn="${btnText}"`);
    lastStatus = status;
    lastBtnText = btnText;
  }
  if (status.startsWith("Ready.") || status.startsWith("Conversion failed")) break;
  await page.waitForTimeout(2000);
}
if (!lastStatus.startsWith("Ready.")) {
  await page.screenshot({ path: `${OUT}/B_stuck.png`, fullPage: true });
  console.log("→ stuck at:", lastStatus);
  for (const l of logs.slice(-30)) console.log("  ", l);
  for (const e of pageErrors) console.log("  PE:", e);
  await browser.close();
  process.exit(1);
}
const b_status = await page.locator("#status-msg").textContent();
const b_filename = await page.locator("#filename").textContent();
const b_startDisabled = await page.locator("#start-btn").isDisabled();
await page.screenshot({ path: `${OUT}/B_converted_ready.png`, fullPage: true });
console.log("status:", b_status);
console.log("filename:", b_filename);
console.log("start disabled:", b_startDisabled);

// ─── PHASE C: drop MP4 instead (regression check, no convert needed) ─────────
console.log("\n=== PHASE C: native MP4 still works (no convert offered) ===");
await page.setInputFiles("#file-input", VIDEO_MP4);
await page.waitForFunction(
  () => (document.getElementById("status-msg")?.textContent ?? "").startsWith("Ready."),
  null,
  { timeout: 10000 },
);
const c_status = await page.locator("#status-msg").textContent();
const c_convertHidden = await page.locator("#convert-btn").evaluate((el) => el.hidden);
console.log("status:", c_status);
console.log("convert hidden:", c_convertHidden);

console.log("\n=== RESULTS ===");
console.log("A status :", a_status);
console.log("A convert visible :", !a_convertHidden);
console.log("A start disabled  :", a_startDisabled);
console.log("B status (post-convert):", b_status);
console.log("B filename :", b_filename);
console.log("B start enabled :", !b_startDisabled);
console.log("C status (native MP4)  :", c_status);
console.log("C convert hidden       :", c_convertHidden);

console.log("\n=== PAGE ERRORS ===");
for (const e of pageErrors) console.log(e);

await browser.close();
