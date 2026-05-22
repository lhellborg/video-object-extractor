import type { Frame } from "./types";

export type VideoLoadReason =
  | "UNSUPPORTED_FORMAT"
  | "DECODE_FAILED"
  | "NO_VIDEO_TRACK"
  | "UNKNOWN";

export class VideoLoadError extends Error {
  readonly reason: VideoLoadReason;
  readonly fileName: string;

  constructor(reason: VideoLoadReason, fileName: string) {
    super(`Failed to load video (${reason}): ${fileName}`);
    this.name = "VideoLoadError";
    this.reason = reason;
    this.fileName = fileName;
  }

  toUserMessage(): string {
    const ext = this.fileName.split(".").pop()?.toLowerCase() ?? "";
    const extLabel = ext ? `.${ext}` : "this format";
    const convertHint =
      ` Try converting to MP4/H.264 first: ffmpeg -i "${this.fileName}" output.mp4`;
    switch (this.reason) {
      case "UNSUPPORTED_FORMAT":
        return `Your browser can't open ${extLabel} files.` + convertHint;
      case "DECODE_FAILED":
        return (
          `The ${extLabel} container loaded but the codec inside can't be decoded — ` +
          `often HEVC/H.265 in Firefox, or older codecs like H.263.` +
          convertHint
        );
      case "NO_VIDEO_TRACK":
        return (
          `No decodable video track found. The file may be audio-only, corrupted, ` +
          `or use a codec the browser doesn't support.` +
          convertHint
        );
      default:
        return `Couldn't load this file.` + convertHint;
    }
  }
}

export async function loadVideo(file: File): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise<void>((resolve, reject) => {
      const onMeta = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        const code = video.error?.code;
        const reason: VideoLoadReason =
          code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
            ? "UNSUPPORTED_FORMAT"
            : code === MediaError.MEDIA_ERR_DECODE
              ? "DECODE_FAILED"
              : "UNKNOWN";
        reject(new VideoLoadError(reason, file.name));
      };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", onErr);
      };
      video.addEventListener("loadedmetadata", onMeta, { once: true });
      video.addEventListener("error", onErr, { once: true });
    });

    if (video.videoWidth === 0 || video.videoHeight === 0 || !isFinite(video.duration)) {
      throw new VideoLoadError("NO_VIDEO_TRACK", file.name);
    }
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }

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
