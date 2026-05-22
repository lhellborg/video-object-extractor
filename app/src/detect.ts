import { AutoModel, AutoProcessor, RawImage } from "@huggingface/transformers";
import type { Detection } from "./types";

const MODEL_ID = "onnx-community/yolov10n";

let model: any = null;
let processor: any = null;

async function hasWebGPU(): Promise<boolean> {
  const nav = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
  if (!nav.gpu) return false;
  try {
    const adapter = await nav.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

export async function loadDetector(
  onProgress?: (msg: string) => void,
): Promise<void> {
  if (model && processor) return;
  onProgress?.("Loading model…");

  const wantWebGPU = await hasWebGPU();
  if (wantWebGPU) {
    try {
      model = await AutoModel.from_pretrained(MODEL_ID, { device: "webgpu", dtype: "fp32" });
      onProgress?.("Model ready (WebGPU)");
    } catch (e) {
      console.warn("WebGPU init failed, falling back to WASM:", e);
      model = await AutoModel.from_pretrained(MODEL_ID);
      onProgress?.("Model ready (WASM)");
    }
  } else {
    model = await AutoModel.from_pretrained(MODEL_ID);
    onProgress?.("Model ready (WASM)");
  }

  processor = await AutoProcessor.from_pretrained(MODEL_ID);
}

/**
 * YOLOv10 returns [1, 300, 6] — each row is [xmin, ymin, xmax, ymax, score, class_id]
 * in the *resized* input coordinate space. Scale back to the canvas's dimensions.
 */
export async function detect(
  canvas: HTMLCanvasElement,
  threshold: number,
  allowedLabels: Set<string> | null,
): Promise<Detection[]> {
  if (!model || !processor) throw new Error("Detector not loaded");

  const image = canvasToRawImage(canvas);
  const { pixel_values, reshaped_input_sizes } = await processor(image);
  const { output0 } = await model({ images: pixel_values });
  const predictions: number[][] = output0.tolist()[0];

  const [newHeight, newWidth] = reshaped_input_sizes[0];
  const sx = canvas.width / newWidth;
  const sy = canvas.height / newHeight;
  const id2label: Record<number, string> = model.config.id2label;

  const out: Detection[] = [];
  for (const [xmin, ymin, xmax, ymax, score, idF] of predictions) {
    if (score < threshold) continue;
    const id = Math.round(idF);
    const label = id2label[id] ?? `class_${id}`;
    if (allowedLabels && !allowedLabels.has(label)) continue;
    out.push({
      bbox: {
        x: xmin * sx,
        y: ymin * sy,
        width: (xmax - xmin) * sx,
        height: (ymax - ymin) * sy,
      },
      label,
      score,
    });
  }
  return out;
}

function canvasToRawImage(canvas: HTMLCanvasElement): RawImage {
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return new RawImage(new Uint8ClampedArray(data.data.buffer), canvas.width, canvas.height, 4);
}

export const COCO_LABELS = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
  "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
  "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
  "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
  "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
  "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup",
  "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
  "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
  "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
  "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
  "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
  "toothbrush",
];
