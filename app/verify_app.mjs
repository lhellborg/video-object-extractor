import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = "http://localhost:5173/";
const VIDEO_MP4 = "/Users/lihel5/playground/video_detection/video0000_short.mp4";
const VIDEO_3GP = "/Users/lihel5/playground/video_detection/video0000.3gp";
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

// ─── PHASE A: error path with 3GP ────────────────────────────────────────────
console.log("\n=== PHASE A: 3GP should be rejected ===");
await page.setInputFiles("#file-input", VIDEO_3GP);
// Wait for status to settle (either Ready. or an error message)
await page.waitForFunction(
  () => {
    const s = document.getElementById("status-msg")?.textContent ?? "";
    return s.startsWith("Ready.") || s.includes("convert") || s.includes("Couldn't") || s.includes("can't");
  },
  null,
  { timeout: 10000 },
);
const phaseAStatus = await page.locator("#status-msg").textContent();
const phaseAStartDisabled = await page.locator("#start-btn").isDisabled();
await page.screenshot({ path: `${OUT}/A_3gp_rejected.png`, fullPage: true });
console.log("3gp status:", phaseAStatus);
console.log("3gp start disabled:", phaseAStartDisabled);

// ─── PHASE B: happy path with MP4 ────────────────────────────────────────────
console.log("\n=== PHASE B: MP4 should load + run ===");
await page.setInputFiles("#file-input", VIDEO_MP4);
await page.waitForFunction(
  () => (document.getElementById("status-msg")?.textContent ?? "").startsWith("Ready."),
  null,
  { timeout: 10000 },
);
const phaseBReadyStatus = await page.locator("#status-msg").textContent();
console.log("mp4 ready status:", phaseBReadyStatus);

await page.locator("#fps-slider").evaluate((el) => {
  el.value = "2";
  el.dispatchEvent(new Event("input", { bubbles: true }));
});

await page.click("#start-btn");
console.log("→ waiting for 'Done.' in status (up to 15 min — WASM is slow)");
await page.waitForFunction(
  () => /Done\.\s+\d+\s+objects extracted/.test(document.getElementById("status-msg")?.textContent ?? ""),
  null,
  { timeout: 15 * 60 * 1000 },
);

const status = await page.locator("#status-msg").textContent();
const objCount = await page.locator("#obj-count").textContent();
const progress = await page.locator("#progress-bar").evaluate((el) => el.style.width);
const downloadDisabled = await page.locator("#download-btn").isDisabled();
const thumbCount = await page.locator(".thumb").count();
await page.screenshot({ path: `${OUT}/B_done.png`, fullPage: true });

console.log("\n=== RESULTS ===");
console.log("phase A (3gp) status :", phaseAStatus);
console.log("phase A start disabled:", phaseAStartDisabled);
console.log("phase B ready status :", phaseBReadyStatus);
console.log("phase B final status :", status);
console.log("phase B obj count    :", objCount);
console.log("phase B progress     :", progress);
console.log("phase B download dis :", downloadDisabled);
console.log("phase B thumbnails   :", thumbCount);

console.log("\n=== PAGE ERRORS ===");
for (const e of pageErrors) console.log(e);

await browser.close();
