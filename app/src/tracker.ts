import type { BBox, Detection, TrackedObject } from "./types";

const IOU_THRESHOLD = 0.3;
const MAX_FRAMES_LOST = 5;

function iou(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter === 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return inter / union;
}

function cropScore(det: Detection): number {
  return det.score * Math.sqrt(det.bbox.width * det.bbox.height);
}

function cropToCanvas(source: HTMLCanvasElement, bbox: BBox): HTMLCanvasElement {
  const x = Math.max(0, Math.floor(bbox.x));
  const y = Math.max(0, Math.floor(bbox.y));
  const w = Math.min(source.width - x, Math.ceil(bbox.width));
  const h = Math.min(source.height - y, Math.ceil(bbox.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  canvas.getContext("2d")!.drawImage(source, x, y, w, h, 0, 0, w, h);
  return canvas;
}

export class Tracker {
  private nextId = 1;
  private active: Map<number, TrackedObject> = new Map();
  private finalized: TrackedObject[] = [];
  private onNew?: (obj: TrackedObject) => void;
  private onUpdate?: (obj: TrackedObject) => void;

  constructor(callbacks?: {
    onNew?: (obj: TrackedObject) => void;
    onUpdate?: (obj: TrackedObject) => void;
  }) {
    this.onNew = callbacks?.onNew;
    this.onUpdate = callbacks?.onUpdate;
  }

  /**
   * Greedy IoU matching between active tracks and new detections.
   * Match only within the same class label.
   */
  update(
    detections: Detection[],
    fullFrame: HTMLCanvasElement,
    frameIndex: number,
    time: number,
  ): void {
    const unmatchedDetections = new Set(detections.map((_, i) => i));
    const unmatchedTracks = new Set(this.active.keys());

    // Score every possible pair, sort by IoU desc, greedily match
    type Pair = { trackId: number; detIdx: number; iou: number };
    const pairs: Pair[] = [];
    for (const trackId of this.active.keys()) {
      const track = this.active.get(trackId)!;
      detections.forEach((det, detIdx) => {
        if (det.label !== track.label) return;
        const score = iou(track.bbox, det.bbox);
        if (score >= IOU_THRESHOLD) pairs.push({ trackId, detIdx, iou: score });
      });
    }
    pairs.sort((a, b) => b.iou - a.iou);

    for (const pair of pairs) {
      if (!unmatchedTracks.has(pair.trackId) || !unmatchedDetections.has(pair.detIdx)) continue;
      unmatchedTracks.delete(pair.trackId);
      unmatchedDetections.delete(pair.detIdx);
      this.updateTrack(pair.trackId, detections[pair.detIdx], fullFrame, frameIndex, time);
    }

    // New tracks from unmatched detections
    for (const detIdx of unmatchedDetections) {
      this.createTrack(detections[detIdx], fullFrame, frameIndex, time);
    }

    // Retire tracks that have been lost too long
    for (const [id, track] of this.active) {
      if (frameIndex - track.lastSeenFrame > MAX_FRAMES_LOST) {
        this.finalized.push(track);
        this.active.delete(id);
      }
    }
  }

  finish(): TrackedObject[] {
    for (const track of this.active.values()) this.finalized.push(track);
    this.active.clear();
    return this.finalized;
  }

  private createTrack(
    det: Detection,
    fullFrame: HTMLCanvasElement,
    frameIndex: number,
    time: number,
  ): void {
    const crop = cropToCanvas(fullFrame, det.bbox);
    const track: TrackedObject = {
      id: this.nextId++,
      label: det.label,
      bbox: det.bbox,
      score: det.score,
      lastSeenFrame: frameIndex,
      firstSeenTime: time,
      bestScore: cropScore(det),
      bestCrop: crop,
      bestBBox: det.bbox,
      bestTime: time,
    };
    this.active.set(track.id, track);
    this.onNew?.(track);
  }

  private updateTrack(
    trackId: number,
    det: Detection,
    fullFrame: HTMLCanvasElement,
    frameIndex: number,
    time: number,
  ): void {
    const track = this.active.get(trackId)!;
    track.bbox = det.bbox;
    track.score = det.score;
    track.lastSeenFrame = frameIndex;
    const score = cropScore(det);
    if (score > track.bestScore) {
      track.bestScore = score;
      track.bestCrop = cropToCanvas(fullFrame, det.bbox);
      track.bestBBox = det.bbox;
      track.bestTime = time;
      this.onUpdate?.(track);
    }
  }
}
