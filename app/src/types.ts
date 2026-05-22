export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  bbox: BBox;
  label: string;
  score: number;
}

export interface Frame {
  time: number;
  index: number;
  full: HTMLCanvasElement;
}

export interface TrackedObject {
  id: number;
  label: string;
  bbox: BBox;
  score: number;
  lastSeenFrame: number;
  firstSeenTime: number;
  bestScore: number;
  bestCrop: HTMLCanvasElement;
  bestBBox: BBox;
  bestTime: number;
}
