import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = "http://localhost:5173/";
const VIDEO = "/Users/lihel5/playground/video_detection/video0000_short.mp4";
const OUT = "/tmp/verify_artifacts";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
const requestFailures = [];
page.on("requestfailed", (r) => requestFailures.push(`${r.url()} :: ${r.failure()?.errorText}`));

console.log("→ navigating to", URL);
await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });

console.log("→ title:", await page.title());
await page.screenshot({ path: `${OUT}/01_initial.png`, fullPage: true });

console.log("→ setting file input");
await page.setInputFiles("#file-input", VIDEO);
await page.waitForSelector("#start-btn:not([disabled])", { timeout: 5000 });

// Lower sample rate so headless WASM finishes in a reasonable time.
await page.locator("#fps-slider").evaluate((el) => {
  el.value = "2";
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
console.log("→ filename shown:", await page.locator("#filename").textContent());
await page.screenshot({ path: `${OUT}/02_loaded.png`, fullPage: true });

console.log("→ clicking Start (model will load on first run)");
await page.click("#start-btn");

// Wait for processing to finish. Status text becomes "Done. N objects extracted."
console.log("→ waiting for 'Done.' in status (up to 15 min — WASM is slow)");
try {
  await page.waitForFunction(
    () => /Done\.\s+\d+\s+objects extracted/.test(document.getElementById("status-msg")?.textContent ?? ""),
    null,
    { timeout: 15 * 60 * 1000 },
  );
} catch (e) {
  console.log("→ timeout waiting for Done. last status:", await page.locator("#status-msg").textContent());
  await page.screenshot({ path: `${OUT}/03_timeout.png`, fullPage: true });
  throw e;
}

const status = await page.locator("#status-msg").textContent();
const objCount = await page.locator("#obj-count").textContent();
const progress = await page.locator("#progress-bar").evaluate((el) => el.style.width);
const downloadDisabled = await page.locator("#download-btn").isDisabled();
const thumbCount = await page.locator(".thumb").count();

await page.screenshot({ path: `${OUT}/04_done.png`, fullPage: true });

// Probe: click Download ZIP and inspect the file
console.log("→ clicking Download ZIP");
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.click("#download-btn"),
]);
const zipPath = `${OUT}/crops.zip`;
await download.saveAs(zipPath);
console.log("→ saved zip:", zipPath);

console.log("\n=== RESULTS ===");
console.log("status:", status);
console.log("obj-count text:", objCount);
console.log("progress width:", progress);
console.log("download disabled:", downloadDisabled);
console.log("thumbnails rendered:", thumbCount);

console.log("\n=== CONSOLE LOGS ===");
for (const l of logs) console.log(l);

console.log("\n=== PAGE ERRORS ===");
for (const e of pageErrors) console.log(e);

console.log("\n=== REQUEST FAILURES ===");
for (const r of requestFailures) console.log(r);

await browser.close();
