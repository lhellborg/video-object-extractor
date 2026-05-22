import type { Frame } from "./types";

export async function loadVideo(file: File): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("Failed to load video")), { once: true });
  });

  return video;
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = Math.min(time, video.duration);
  });
}

export async function* extractFrames(
  video: HTMLVideoElement,
  sampleFps: number,
): AsyncGenerator<Frame> {
  const duration = video.duration;
  const step = 1 / sampleFps;
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = video.videoWidth;
  fullCanvas.height = video.videoHeight;
  const fullCtx = fullCanvas.getContext("2d", { willReadFrequently: true })!;

  let index = 0;
  for (let t = 0; t < duration; t += step) {
    await seek(video, t);
    fullCtx.drawImage(video, 0, 0);

    // Clone full canvas so consumers can hold onto it
    const full = document.createElement("canvas");
    full.width = fullCanvas.width;
    full.height = fullCanvas.height;
    full.getContext("2d")!.drawImage(fullCanvas, 0, 0);

    yield { time: t, index: index++, full };
  }
}

export function estimateFrameCount(video: HTMLVideoElement, sampleFps: number): number {
  return Math.ceil(video.duration * sampleFps);
}
