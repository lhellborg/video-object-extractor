import type { TrackedObject } from "./types";

export interface UIElements {
  dropZone: HTMLElement;
  fileInput: HTMLInputElement;
  pickBtn: HTMLButtonElement;
  filename: HTMLElement;
  fpsSlider: HTMLInputElement;
  fpsLabel: HTMLElement;
  threshSlider: HTMLInputElement;
  threshLabel: HTMLElement;
  startBtn: HTMLButtonElement;
  statusMsg: HTMLElement;
  convertBtn: HTMLButtonElement;
  progressBar: HTMLElement;
  objCount: HTMLElement;
  downloadBtn: HTMLButtonElement;
  thumbnails: HTMLElement;
}

export function getUI(): UIElements {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  return {
    dropZone: $("drop-zone"),
    fileInput: $("file-input") as HTMLInputElement,
    pickBtn: $("pick-btn") as HTMLButtonElement,
    filename: $("filename"),
    fpsSlider: $("fps-slider") as HTMLInputElement,
    fpsLabel: $("fps-label"),
    threshSlider: $("thresh-slider") as HTMLInputElement,
    threshLabel: $("thresh-label"),
    startBtn: $("start-btn") as HTMLButtonElement,
    statusMsg: $("status-msg"),
    convertBtn: $("convert-btn") as HTMLButtonElement,
    progressBar: $("progress-bar"),
    objCount: $("obj-count"),
    downloadBtn: $("download-btn") as HTMLButtonElement,
    thumbnails: $("thumbnails"),
  };
}

export function wireSliders(ui: UIElements): void {
  const sync = () => {
    ui.fpsLabel.textContent = ui.fpsSlider.value;
    ui.threshLabel.textContent = Number(ui.threshSlider.value).toFixed(2);
  };
  ui.fpsSlider.addEventListener("input", sync);
  ui.threshSlider.addEventListener("input", sync);
  sync();
}

export function wireDropzone(ui: UIElements, onFile: (file: File) => void): void {
  ui.pickBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    ui.fileInput.click();
  });
  ui.dropZone.addEventListener("click", () => ui.fileInput.click());
  ui.fileInput.addEventListener("change", () => {
    const f = ui.fileInput.files?.[0];
    if (f) onFile(f);
  });

  const prevent = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) =>
    ui.dropZone.addEventListener(ev, prevent),
  );
  ui.dropZone.addEventListener("dragenter", () => ui.dropZone.classList.add("drag"));
  ui.dropZone.addEventListener("dragover", () => ui.dropZone.classList.add("drag"));
  ui.dropZone.addEventListener("dragleave", () => ui.dropZone.classList.remove("drag"));
  ui.dropZone.addEventListener("drop", (e: DragEvent) => {
    ui.dropZone.classList.remove("drag");
    const f = e.dataTransfer?.files?.[0];
    if (f) onFile(f);
  });
}

export function setStatus(ui: UIElements, msg: string): void {
  ui.statusMsg.textContent = msg;
}

export function showConvertButton(ui: UIElements, show: boolean): void {
  ui.convertBtn.hidden = !show;
  ui.convertBtn.disabled = false;
  ui.convertBtn.textContent = "Convert with ffmpeg (~30 MB download)";
}

export function setConvertProgress(ui: UIElements, label: string): void {
  ui.convertBtn.disabled = true;
  ui.convertBtn.textContent = label;
}

export function setProgress(ui: UIElements, pct: number): void {
  ui.progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

const thumbEls = new Map<number, HTMLElement>();

export function resetThumbnails(ui: UIElements): void {
  ui.thumbnails.innerHTML = "";
  thumbEls.clear();
  ui.objCount.textContent = "0";
}

export function addThumbnail(ui: UIElements, obj: TrackedObject): void {
  const div = document.createElement("div");
  div.className = "thumb";
  div.dataset.id = String(obj.id);

  const img = document.createElement("img");
  img.src = obj.bestCrop.toDataURL("image/jpeg", 0.85);
  div.appendChild(img);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<span class="label">${obj.label}</span><span>#${obj.id}</span>`;
  div.appendChild(meta);

  ui.thumbnails.appendChild(div);
  thumbEls.set(obj.id, div);
  ui.objCount.textContent = String(thumbEls.size);
}

export function updateThumbnail(_ui: UIElements, obj: TrackedObject): void {
  const div = thumbEls.get(obj.id);
  if (!div) return;
  const img = div.querySelector("img");
  if (img) img.src = obj.bestCrop.toDataURL("image/jpeg", 0.85);
}
