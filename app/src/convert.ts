// ffmpeg.wasm — loaded lazily, single-threaded build so no Cross-Origin
// Isolation headers are required (works on GitHub Pages).
//
// The class worker is bundled via Vite's `?worker&url` so its relative
// imports (./const.js etc.) resolve against the same-origin bundled URL;
// a cross-origin blob URL doesn't work because relative imports can't be
// rewritten through it.
// Use the public `./worker` export of @ffmpeg/ffmpeg; `?worker&url` tells Vite
// to bundle the worker (resolving its relative imports) and return its URL.
import classWorkerURL from "@ffmpeg/ffmpeg/worker?worker&url";

const FFMPEG_CORE_VERSION = "0.12.10";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;

let instance: any | null = null;

export type ConvertProgress =
  | { phase: "loading"; pct: number }
  | { phase: "converting"; pct: number };

async function ensureFFmpeg(
  onProgress?: (p: ConvertProgress) => void,
): Promise<any> {
  if (instance) return instance;

  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);

  const ff = new FFmpeg();
  onProgress?.({ phase: "loading", pct: 0 });

  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
  ]);
  await ff.load({ coreURL, wasmURL, classWorkerURL });

  instance = ff;
  return ff;
}

export async function convertToMp4(
  file: File,
  onProgress?: (p: ConvertProgress) => void,
): Promise<File> {
  const ff = await ensureFFmpeg(onProgress);
  const { fetchFile } = await import("@ffmpeg/util");

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const inputName = `input.${ext}`;
  const outputName = "output.mp4";

  const progressHandler = (e: { progress: number }) => {
    onProgress?.({ phase: "converting", pct: Math.max(0, Math.min(1, e.progress)) });
  };
  ff.on("progress", progressHandler);

  try {
    await ff.writeFile(inputName, await fetchFile(file));
    await ff.exec([
      "-i", inputName,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-movflags", "+faststart",
      outputName,
    ]);
    const data = (await ff.readFile(outputName)) as Uint8Array;
    const blob = new Blob([data as BlobPart], { type: "video/mp4" });
    const newName = file.name.replace(/\.[^.]+$/, "") + ".mp4";
    return new File([blob], newName, { type: "video/mp4" });
  } finally {
    ff.off("progress", progressHandler);
    try { await ff.deleteFile(inputName); } catch {}
    try { await ff.deleteFile(outputName); } catch {}
  }
}
