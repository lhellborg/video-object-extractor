import "./style.css";
import JSZip from "jszip";
import { extractFrames, loadVideo, estimateFrameCount, VideoLoadError } from "./frames";
import { detect, loadDetector } from "./detect";
import { Tracker } from "./tracker";
import { convertToMp4 } from "./convert";
import {
  addThumbnail,
  getUI,
  resetThumbnails,
  setConvertProgress,
  setProgress,
  setStatus,
  showConvertButton,
  updateThumbnail,
  wireDropzone,
  wireSliders,
} from "./ui";
import type { TrackedObject } from "./types";

const ui = getUI();
let selectedFile: File | null = null;
let loadedVideo: HTMLVideoElement | null = null;
let finalTracks: TrackedObject[] = [];
let isRunning = false;
let pendingConvertFile: File | null = null;
let isConverting = false;

async function validateFile(file: File): Promise<void> {
  selectedFile = null;
  pendingConvertFile = null;
  if (loadedVideo) {
    URL.revokeObjectURL(loadedVideo.src);
    loadedVideo = null;
  }
  ui.startBtn.disabled = true;
  showConvertButton(ui, false);
  ui.filename.textContent = file.name;
  setStatus(ui, "Checking format…");

  try {
    loadedVideo = await loadVideo(file);
    selectedFile = file;
    ui.startBtn.disabled = false;
    setStatus(
      ui,
      `Ready. ${loadedVideo.videoWidth}×${loadedVideo.videoHeight}, ${loadedVideo.duration.toFixed(1)}s — click Start.`,
    );
  } catch (e) {
    if (e instanceof VideoLoadError) {
      setStatus(ui, e.toUserMessage());
      pendingConvertFile = file;
      showConvertButton(ui, true);
    } else {
      setStatus(ui, `Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function convert(file: File): Promise<void> {
  isConverting = true;
  setConvertProgress(ui, "Loading ffmpeg…");
  try {
    const converted = await convertToMp4(file, (p) => {
      if (p.phase === "loading") {
        setConvertProgress(ui, "Loading ffmpeg…");
      } else {
        setConvertProgress(ui, `Converting… ${Math.round(p.pct * 100)}%`);
      }
    });
    showConvertButton(ui, false);
    setStatus(ui, "Conversion complete. Re-checking format…");
    await validateFile(converted);
  } catch (e) {
    setStatus(ui, `Conversion failed: ${e instanceof Error ? e.message : String(e)}`);
    showConvertButton(ui, true);
  } finally {
    isConverting = false;
  }
}

wireSliders(ui);
wireDropzone(ui, (file) => {
  void validateFile(file);
});

ui.startBtn.addEventListener("click", () => {
  if (!selectedFile || isRunning) return;
  void run(selectedFile);
});

ui.convertBtn.addEventListener("click", () => {
  if (!pendingConvertFile || isConverting) return;
  void convert(pendingConvertFile);
});

ui.downloadBtn.addEventListener("click", () => {
  if (finalTracks.length === 0) return;
  void downloadZip(finalTracks, selectedFile?.name ?? "video");
});

async function run(file: File): Promise<void> {
  isRunning = true;
  ui.startBtn.disabled = true;
  ui.downloadBtn.disabled = true;
  resetThumbnails(ui);
  finalTracks = [];
  setProgress(ui, 0);

  try {
    await loadDetector((msg) => setStatus(ui, msg));

    const video = loadedVideo ?? (await loadVideo(file));
    loadedVideo = video;

    const fps = Number(ui.fpsSlider.value);
    const threshold = Number(ui.threshSlider.value);
    const totalFrames = estimateFrameCount(video, fps);

    const tracker = new Tracker({
      onNew: (obj) => addThumbnail(ui, obj),
      onUpdate: (obj) => updateThumbnail(ui, obj),
    });

    const t0 = performance.now();
    let frameIdx = 0;
    for await (const frame of extractFrames(video, fps)) {
      const detections = await detect(frame.full, threshold, null);
      tracker.update(detections, frame.full, frame.index, frame.time);

      frameIdx++;
      const pct = (frameIdx / totalFrames) * 100;
      setProgress(ui, pct);
      const elapsed = (performance.now() - t0) / 1000;
      const realtime = elapsed > 0 ? frame.time / elapsed : 0;
      setStatus(
        ui,
        `Frame ${frameIdx}/${totalFrames} · ${realtime.toFixed(1)}× realtime`,
      );

      await new Promise((r) => setTimeout(r, 0));
    }

    finalTracks = tracker.finish();
    setProgress(ui, 100);
    setStatus(ui, `Done. ${finalTracks.length} objects extracted.`);
    ui.downloadBtn.disabled = finalTracks.length === 0;
  } catch (err) {
    console.error(err);
    setStatus(ui, `Error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    isRunning = false;
    ui.startBtn.disabled = false;
  }
}

async function downloadZip(tracks: TrackedObject[], sourceName: string): Promise<void> {
  setStatus(ui, "Building ZIP…");
  const zip = new JSZip();
  const counts: Record<string, number> = {};
  const manifest: any[] = [];

  for (const t of tracks) {
    counts[t.label] = (counts[t.label] ?? 0) + 1;
    const idx = String(counts[t.label]).padStart(3, "0");
    const name = `${t.label.replace(/\s+/g, "_")}_${idx}.jpg`;
    const blob: Blob = await new Promise((resolve) =>
      t.bestCrop.toBlob((b) => resolve(b!), "image/jpeg", 0.92),
    );
    zip.file(name, blob);
    manifest.push({
      file: name,
      id: t.id,
      label: t.label,
      confidence: Number(t.score.toFixed(3)),
      first_seen_time: Number(t.firstSeenTime.toFixed(2)),
      best_frame_time: Number(t.bestTime.toFixed(2)),
      bbox: {
        x: Math.round(t.bestBBox.x),
        y: Math.round(t.bestBBox.y),
        width: Math.round(t.bestBBox.width),
        height: Math.round(t.bestBBox.height),
      },
    });
  }
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sourceName.replace(/\.[^.]+$/, "")}_crops.zip`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(ui, `Done. ${tracks.length} objects extracted.`);
}
