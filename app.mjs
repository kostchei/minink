import { fitSize, stylizeImageData } from "./processor.mjs";

const PRESETS = {
  classic: {
    resolution: 512,
    paletteSize: 20,
    edgeDetail: 40,
    outlineWidth: 1,
    hueWeight: 82,
    valueWeight: 52,
    saturation: 118,
    contrast: 110,
    shadowLift: 20,
    smoothing: 2,
    regionCleanup: 2,
    dither: 0,
  },
  chunky: {
    resolution: 128,
    paletteSize: 10,
    edgeDetail: 44,
    outlineWidth: 1,
    hueWeight: 76,
    valueWeight: 58,
    saturation: 125,
    contrast: 115,
    shadowLift: 16,
    smoothing: 2,
    regionCleanup: 3,
    dither: 0,
  },
  graphic: {
    resolution: 288,
    paletteSize: 9,
    edgeDetail: 55,
    outlineWidth: 2,
    hueWeight: 65,
    valueWeight: 72,
    saturation: 112,
    contrast: 122,
    shadowLift: 10,
    smoothing: 2,
    regionCleanup: 3,
    dither: 0,
  },
  soft: {
    resolution: 320,
    paletteSize: 18,
    edgeDetail: 36,
    outlineWidth: 1,
    hueWeight: 74,
    valueWeight: 46,
    saturation: 108,
    contrast: 102,
    shadowLift: 18,
    smoothing: 2,
    regionCleanup: 1,
    dither: 3,
  },
  hardware: {
    resolution: 512,
    paletteSize: 18,
    edgeDetail: 48,
    outlineWidth: 1,
    hueWeight: 90,
    valueWeight: 60,
    saturation: 120,
    contrast: 115,
    shadowLift: 15,
    smoothing: 2,
    regionCleanup: 2,
    dither: 0,
  },
};

const elements = {
  fileInput: document.querySelector("#file-input"),
  dropZone: document.querySelector("#drop-zone"),
  sourceCanvas: document.querySelector("#source-canvas"),
  resultCanvas: document.querySelector("#result-canvas"),
  emptySource: document.querySelector("#empty-source"),
  emptyResult: document.querySelector("#empty-result"),
  sourceMeta: document.querySelector("#source-meta"),
  outputMeta: document.querySelector("#output-meta"),
  status: document.querySelector("#status"),
  download: document.querySelector("#download"),
  exportScale: document.querySelector("#export-scale"),
  palette: document.querySelector("#palette"),
  mlEnable: document.querySelector("#ml-enable"),
  mlKeep: document.querySelector("#ml-keep"),
  mlClear: document.querySelector("#ml-clear"),
  mlOverlay: document.querySelector("#ml-overlay"),
  mlStatus: document.querySelector("#ml-status"),
  suppressInnerLines: document.querySelector("#suppress-inner-lines"),
  fillColorSelect: document.querySelector("#fill-color-select"),
  fillComponent: document.querySelector("#fill-component"),
  clearBackground: document.querySelector("#clear-background"),
  resetFills: document.querySelector("#reset-fills"),
  toolSelect: document.querySelector("#tool-select"),
  toolEraser: document.querySelector("#tool-eraser"),
  eraserSize: document.querySelector("#eraser-size"),
  clearErased: document.querySelector("#clear-erased"),
  eraserOverlay: document.querySelector("#eraser-overlay"),
  resultArtboard: document.querySelector(".result-artboard"),
  quickEraserToggle: document.querySelector("#quick-eraser-toggle"),
  quickFillComponent: document.querySelector("#quick-fill-component"),
  quickClearBg: document.querySelector("#quick-clear-bg"),
  controls: Array.from(document.querySelectorAll("[data-control]")),
  presetButtons: Array.from(document.querySelectorAll("[data-preset]")),
};

let source = null;
let sourceName = "mini";
let renderTimer = null;
let renderVersion = 0;
let mlSegmenter = null;
let mlCurrentMask = null;
let mlKeptMasks = [];
let mlReady = false;

let currentTool = "select";
let fillColorSelection = "cream";
let fillColorsMap = new Map();
let backgroundFillColor = null;
let erasedLinesMask = null;
let erasedMaskWidth = 0;
let erasedMaskHeight = 0;
let isErasing = false;

elements.fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) loadFile(file);
  event.target.value = "";
});

window.addEventListener("dragenter", handleFileDrag);
window.addEventListener("dragover", handleFileDrag);
window.addEventListener("dragleave", (event) => {
  if (event.relatedTarget === null) setDraggingState(false);
});
window.addEventListener("drop", handleFileDrop);

elements.controls.forEach((control) => {
  control.addEventListener("input", () => {
    syncControlReadout(control);
    clearPresetSelection();
    scheduleRender();
  });
});

elements.presetButtons.forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset));
});

elements.download.addEventListener("click", downloadResult);
elements.exportScale.addEventListener("change", updateOutputMeta);
elements.mlEnable.addEventListener("click", enableMlBoundaries);
elements.mlKeep.addEventListener("click", keepMlBoundary);
elements.mlClear.addEventListener("click", clearMlBoundaries);
elements.sourceCanvas.addEventListener("click", selectMlComponent);

if (elements.fillComponent) elements.fillComponent.addEventListener("click", fillComponentAction);
if (elements.clearBackground) elements.clearBackground.addEventListener("click", clearBackgroundAction);
if (elements.resetFills) elements.resetFills.addEventListener("click", resetFillsAction);
if (elements.suppressInnerLines) elements.suppressInnerLines.addEventListener("change", () => scheduleRender(0));
if (elements.fillColorSelect) {
  elements.fillColorSelect.addEventListener("change", (event) => {
    fillColorSelection = event.target.value;
  });
}
if (elements.toolSelect && elements.toolEraser) {
  elements.toolSelect.addEventListener("click", () => setToolMode("select"));
  elements.toolEraser.addEventListener("click", () => setToolMode("eraser"));
}
if (elements.eraserSize) {
  elements.eraserSize.addEventListener("input", () => {
    syncControlReadout(elements.eraserSize);
  });
}
if (elements.clearErased) elements.clearErased.addEventListener("click", clearErasedLinesAction);

if (elements.quickEraserToggle) {
  elements.quickEraserToggle.addEventListener("click", () => {
    setToolMode(currentTool === "eraser" ? "select" : "eraser");
  });
}
if (elements.quickFillComponent) elements.quickFillComponent.addEventListener("click", fillComponentAction);
if (elements.quickClearBg) elements.quickClearBg.addEventListener("click", clearBackgroundAction);

if (elements.resultCanvas) {
  elements.resultCanvas.addEventListener("pointerdown", handlePointerDown);
  elements.resultCanvas.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  elements.resultCanvas.addEventListener("pointerleave", clearEraserOverlay);
}

applyPreset("classic", false);
createDemoMini();

window.addEventListener("paste", async (event) => {
  const items = event.clipboardData?.items || [];
  for (const item of items) {
    if (item.type && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        loadFile(file);
        return;
      }
    }
  }
  const text = event.clipboardData?.getData("text/plain");
  if (text && /^https?:\/\/.+/i.test(text.trim())) {
    try {
      setStatus("Fetching pasted image URL…");
      const response = await fetch(text.trim());
      const blob = await response.blob();
      if (blob.type.startsWith("image/")) {
        const file = new File([blob], "pasted-image.png", { type: blob.type });
        loadFile(file);
      }
    } catch (err) {
      console.error(err);
      setStatus("Could not load image from pasted URL.", "error");
    }
  }
});

async function loadFile(file) {
  if (!file) return;
  const processedFile = await convertHeicIfNeeded(file);

  if (!isSupportedImage(processedFile)) {
    setStatus("Choose an image file such as JPG, PNG, WebP, AVIF, or BMP.", "error");
    return;
  }

  setStatus("Loading photo…");
  sourceName = sanitizeFileStem(processedFile.name || "mini");

  try {
    const decodedImage = await decodeImageFile(processedFile);
    replaceSource(decodedImage);
    setStatus("Photo ready. Adjust the style or export it.", "success");
  } catch (error) {
    console.error(error);
    const isHeic = /\.(?:heic|heif)$/i.test(processedFile.name || "");
    if (isHeic) {
      setStatus("HEIC photos could not be decoded. Please convert to JPG or PNG.", "error");
    } else {
      setStatus(`Could not read image: ${error.message || "Unknown error"}. Try converting to JPG/PNG.`, "error");
    }
  }
}

function handleFileDrag(event) {
  if (!hasDraggedFiles(event.dataTransfer)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  setDraggingState(true);
}

async function handleFileDrop(event) {
  if (!hasDraggedFiles(event.dataTransfer)) return;
  event.preventDefault();
  event.stopPropagation();
  setDraggingState(false);

  let file = firstDroppedFile(event.dataTransfer);
  if (!file) {
    const url = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    if (url && /^https?:\/\/.+/i.test(url.trim())) {
      try {
        setStatus("Fetching dropped image URL…");
        const response = await fetch(url.trim());
        const blob = await response.blob();
        if (blob.type.startsWith("image/")) {
          file = new File([blob], "dropped-image.png", { type: blob.type });
        }
      } catch (err) {
        console.error(err);
      }
    }
  }

  if (file) {
    loadFile(file);
  } else {
    setStatus("The dropped item did not contain a readable image.", "error");
  }
}

function hasDraggedFiles(dataTransfer) {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types || []).includes("Files")
    || Array.from(dataTransfer.items || []).some((item) => item.kind === "file")
    || dataTransfer.files?.length > 0;
}

function firstDroppedFile(dataTransfer) {
  for (const item of Array.from(dataTransfer?.items || [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return dataTransfer?.files?.[0] || null;
}

function isSupportedImage(file) {
  return (
    (Boolean(file.type) && file.type.startsWith("image/"))
    || /\.(?:jpe?g|png|webp|avif|bmp|gif|tiff?|jfif|heic|heif|svg)$/i.test(file.name)
  );
}

function setDraggingState(isDragging) {
  elements.dropZone.classList.toggle("is-dragging", isDragging);
  document.body.classList.toggle("is-file-dragging", isDragging);
}

function replaceSource(nextSource) {
  if (source && typeof source.close === "function") source.close();
  source = nextSource;
  clearMlBoundaries();
  clearFills();
  clearErasedLinesAction();
  elements.emptySource.hidden = true;
  elements.emptyResult.hidden = true;
  elements.download.disabled = false;
  drawSourcePreview();
  scheduleRender(0);
}

function drawSourcePreview() {
  if (!source) return;
  const { width, height } = sourceDimensions(source);
  const previewSize = fitWithin(width, height, 900);
  const canvas = elements.sourceCanvas;
  canvas.width = previewSize.width;
  canvas.height = previewSize.height;
  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  elements.sourceMeta.textContent = `${width} × ${height} source`;
}

function scheduleRender(delay = 140) {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, delay);
}

async function render() {
  if (!source) return;
  const version = ++renderVersion;
  setStatus("Drawing ink…");
  await nextFrame();

  const controls = readControls();
  const sourceSize = sourceDimensions(source);
  const outputSize = fitSize(sourceSize.width, sourceSize.height, controls.resolution);
  const workCanvas = document.createElement("canvas");
  workCanvas.width = outputSize.width;
  workCanvas.height = outputSize.height;
  const workContext = workCanvas.getContext("2d", { willReadFrequently: true });
  workContext.imageSmoothingEnabled = true;
  workContext.imageSmoothingQuality = "high";
  workContext.drawImage(source, 0, 0, outputSize.width, outputSize.height);
  const input = workContext.getImageData(0, 0, outputSize.width, outputSize.height);

  const componentMap = buildComponentMap(outputSize.width, outputSize.height);
  const { imageData, palette } = stylizeImageData(input, {
    paletteSize: controls.paletteSize,
    edgeThreshold: detailToThreshold(controls.edgeDetail),
    outlineWidth: controls.outlineWidth,
    hueWeight: controls.hueWeight / 100,
    valueWeight: controls.valueWeight / 100,
    saturation: controls.saturation / 100,
    contrast: controls.contrast / 100,
    shadowLift: controls.shadowLift / 100,
    smoothing: controls.smoothing,
    regionCleanup: controls.regionCleanup,
    dither: controls.dither / 100,
    componentMap,
    suppressInnerLines: elements.suppressInnerLines ? elements.suppressInnerLines.checked : true,
    fillMap: componentMap,
    fillColors: fillColorsMap,
    backgroundFill: backgroundFillColor,
    erasedLinesMask: (erasedLinesMask && erasedMaskWidth === outputSize.width && erasedMaskHeight === outputSize.height) ? erasedLinesMask : null,
  });

  if (version !== renderVersion) return;
  const canvas = elements.resultCanvas;
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;
  canvas.getContext("2d").putImageData(imageData, 0, 0);
  drawPalette(palette);
  updateOutputMeta();
  setStatus("Ink pass complete.", "success");
}

function applyPreset(name, rerender = true) {
  const preset = PRESETS[name];
  if (!preset) return;

  Object.entries(preset).forEach(([controlName, value]) => {
    const input = document.querySelector(`[data-control="${controlName}"]`);
    input.value = value;
    syncControlReadout(input);
  });

  elements.presetButtons.forEach((button) => {
    const isActive = button.dataset.preset === name;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (rerender) scheduleRender(0);
}

function clearPresetSelection() {
  elements.presetButtons.forEach((button) => {
    button.classList.remove("is-active");
    button.setAttribute("aria-pressed", "false");
  });
}

function readControls() {
  return Object.fromEntries(
    elements.controls.map((control) => [
      control.dataset.control,
      Number(control.value),
    ]),
  );
}

function syncControlReadout(control) {
  const readout = document.querySelector(`[data-value-for="${control.dataset.control}"]`);
  const suffix = control.dataset.suffix || "";
  if (readout) readout.textContent = `${control.value}${suffix}`;
}

function drawPalette(palette) {
  elements.palette.replaceChildren(
    ...palette.map((color) => {
      const swatch = document.createElement("span");
      swatch.style.backgroundColor = `rgb(${color.join(",")})`;
      swatch.title = `rgb(${color.join(", ")})`;
      return swatch;
    }),
  );
}

function updateOutputMeta() {
  const canvas = elements.resultCanvas;
  if (!canvas.width || !canvas.height || !source) return;
  const scale = Number(elements.exportScale.value);
  elements.outputMeta.textContent = (
    `${canvas.width} × ${canvas.height} art · ${canvas.width * scale} × ${canvas.height * scale} export`
  );
}

function downloadResult() {
  const sourceCanvas = elements.resultCanvas;
  if (!source || !sourceCanvas.width) return;

  const scale = Number(elements.exportScale.value);
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = sourceCanvas.width * scale;
  exportCanvas.height = sourceCanvas.height * scale;
  const context = exportCanvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(sourceCanvas, 0, 0, exportCanvas.width, exportCanvas.height);

  exportCanvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `${sourceName}-mini-ink-${sourceCanvas.width}x${sourceCanvas.height}.png`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }, "image/png");
}

function createDemoMini() {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 720;
  const context = canvas.getContext("2d");

  context.fillStyle = "#d9d0bd";
  context.fillRect(0, 0, 720, 720);
  const vignette = context.createRadialGradient(360, 310, 60, 360, 360, 520);
  vignette.addColorStop(0, "rgba(255,255,255,.9)");
  vignette.addColorStop(1, "rgba(43,35,36,.3)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, 720, 720);

  context.save();
  context.translate(360, 380);
  context.shadowColor = "rgba(26,22,24,.38)";
  context.shadowBlur = 28;
  context.shadowOffsetY = 20;
  context.fillStyle = "#29282a";
  context.beginPath();
  context.ellipse(0, 242, 178, 54, 0, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = "transparent";

  context.fillStyle = "#7b858c";
  context.fillRect(-72, 3, 144, 206);
  context.fillStyle = "#343a40";
  context.fillRect(-45, 46, 90, 121);
  context.fillStyle = "#c5c1b5";
  context.fillRect(-24, 64, 48, 76);
  context.fillStyle = "#9d342c";
  context.fillRect(-17, 78, 34, 48);

  context.fillStyle = "#313a39";
  context.beginPath();
  context.moveTo(-76, 8);
  context.lineTo(-130, 72);
  context.lineTo(-92, 158);
  context.lineTo(-51, 112);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(76, 8);
  context.lineTo(130, 72);
  context.lineTo(92, 158);
  context.lineTo(51, 112);
  context.closePath();
  context.fill();

  context.fillStyle = "#5a625e";
  context.fillRect(-91, 202, 58, 38);
  context.fillRect(33, 202, 58, 38);

  context.fillStyle = "#a43d32";
  context.beginPath();
  context.moveTo(-76, 10);
  context.lineTo(-52, -91);
  context.lineTo(0, -126);
  context.lineTo(52, -91);
  context.lineTo(76, 10);
  context.closePath();
  context.fill();
  context.fillStyle = "#d4b56a";
  context.beginPath();
  context.arc(0, -68, 35, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#26292c";
  context.fillRect(-50, -134, 100, 44);

  context.strokeStyle = "#292a2d";
  context.lineWidth = 18;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(-106, 67);
  context.lineTo(-174, 15);
  context.moveTo(106, 67);
  context.lineTo(174, 15);
  context.stroke();
  context.strokeStyle = "#b7b7ae";
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(174, 15);
  context.lineTo(210, -79);
  context.stroke();
  context.restore();

  sourceName = "demo-guardian";
  replaceSource(canvas);
}

function setStatus(message, tone = "neutral") {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function detailToThreshold(detail) {
  return 0.43 - (detail / 100) * 0.3;
}

function sourceDimensions(input) {
  if (!input) return { width: 1, height: 1 };
  const width = Math.max(1, Math.round(Number(input.naturalWidth || input.width) || 1));
  const height = Math.max(1, Math.round(Number(input.naturalHeight || input.height) || 1));
  return { width, height };
}

function fitWithin(width, height, maxLongEdge) {
  if (Math.max(width, height) <= maxLongEdge) return { width, height };
  return fitSize(width, height, maxLongEdge);
}

function sanitizeFileStem(filename) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "mini";
}

async function decodeImageFile(file) {
  try {
    return await loadViaImageElement(file);
  } catch {}

  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {}

  try {
    return await createImageBitmap(file);
  } catch {}

  return await loadViaDataUrl(file);
}

function loadViaImageElement(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected image could not be read."));
    };
    image.src = objectUrl;
  });
}

function loadViaDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to decode image from Data URL."));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

async function convertHeicIfNeeded(file) {
  const isHeic = /\.(?:heic|heif)$/i.test(file.name || "") || file.type === "image/heic" || file.type === "image/heif";
  if (!isHeic) return file;

  setStatus("Converting HEIC photo…");
  try {
    if (!window.heic2any) {
      await loadScript("https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js");
    }
    if (window.heic2any) {
      const result = await window.heic2any({ blob: file, toType: "image/png" });
      const convertedBlob = Array.isArray(result) ? result[0] : result;
      return new File([convertedBlob], (file.name || "photo").replace(/\.(?:heic|heif)$/i, ".png"), { type: "image/png" });
    }
  } catch (err) {
    console.warn("HEIC auto-conversion skipped:", err);
  }
  return file;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function enableMlBoundaries() {
  if (!source) return;
  elements.mlEnable.disabled = true;

  try {
    if (!mlSegmenter) {
      setMlStatus("Loading local ML model… first use downloads its files.");
      const { ComponentSegmenter } = await import("./ml-segmenter.mjs");
      mlSegmenter = new ComponentSegmenter((message) => setMlStatus(message));
      await mlSegmenter.load();
    }

    setMlStatus("Learning this photo’s component shapes…");
    await mlSegmenter.encode(elements.sourceCanvas);
    mlReady = true;
    elements.mlEnable.textContent = "ML ready";
    elements.sourceCanvas.classList.add("is-ml-ready");
    setMlStatus("Click a component in the original, then keep its boundary.");
  } catch (error) {
    console.error(error);
    setMlStatus("ML could not start. The hue + value detector is still active.", true);
    elements.mlEnable.disabled = false;
  }
}

async function selectMlComponent(event) {
  if (!mlReady || !mlSegmenter) return;

  const bounds = elements.sourceCanvas.getBoundingClientRect();
  const point = [
    (event.clientX - bounds.left) / bounds.width,
    (event.clientY - bounds.top) / bounds.height,
  ];

  setMlStatus("Finding that component…");
  elements.sourceCanvas.classList.add("is-ml-working");

  try {
    mlCurrentMask = await mlSegmenter.segment(point);
    drawMlOverlay();
    elements.mlKeep.disabled = false;
    updateFillButtonState(false);
    setMlStatus("Mask ready. Keep it, or click another part to try again.");
    scheduleRender(0);
  } catch (error) {
    console.error(error);
    setMlStatus("That component could not be isolated. Try another point.", true);
  } finally {
    elements.sourceCanvas.classList.remove("is-ml-working");
  }
}

function keepMlBoundary() {
  if (!mlCurrentMask) return;
  mlKeptMasks.push(mlCurrentMask);
  mlCurrentMask = null;
  elements.mlKeep.disabled = true;
  updateFillButtonState(false);
  drawMlOverlay();
  setMlStatus(`${mlKeptMasks.length} ML component ${mlKeptMasks.length === 1 ? "line" : "lines"} kept.`);
  scheduleRender(0);
}

function clearMlBoundaries() {
  mlCurrentMask = null;
  mlKeptMasks = [];
  mlReady = false;
  elements.mlKeep.disabled = true;
  updateFillButtonState(true);
  elements.mlEnable.disabled = false;
  elements.mlEnable.textContent = mlSegmenter ? "Re-scan photo" : "Enable ML boundaries";
  elements.sourceCanvas.classList.remove("is-ml-ready", "is-ml-working");
  setMlStatus("Optional: click-pick physical components with local ML.");
  drawMlOverlay();
}

function drawMlOverlay() {
  const overlay = elements.mlOverlay || document.querySelector("#ml-overlay");
  const sourceCanvas = elements.sourceCanvas || document.querySelector("#source-canvas");
  if (!overlay || !sourceCanvas || !sourceCanvas.width) return;

  overlay.width = sourceCanvas.width;
  overlay.height = sourceCanvas.height;
  const context = overlay.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, overlay.width, overlay.height);

  const masks = [
    ...mlKeptMasks.map((mask) => ({ mask, color: [105, 213, 219, 70] })),
    ...(mlCurrentMask ? [{ mask: mlCurrentMask, color: [215, 255, 100, 100] }] : []),
  ];
  if (masks.length === 0) return;

  const imageData = context.createImageData(overlay.width, overlay.height);

  for (const { mask, color } of masks) {
    for (let index = 0; index < mask.data.length; index += 1) {
      if (!mask.data[index]) continue;
      const offset = index * 4;
      imageData.data[offset] = color[0];
      imageData.data[offset + 1] = color[1];
      imageData.data[offset + 2] = color[2];
      imageData.data[offset + 3] = color[3];
    }
  }

  context.putImageData(imageData, 0, 0);
}

function buildComponentMap(width, height) {
  const masksToInclude = [...mlKeptMasks];
  if (mlCurrentMask && !mlKeptMasks.includes(mlCurrentMask)) {
    masksToInclude.push(mlCurrentMask);
  }
  if (masksToInclude.length === 0) return null;

  const map = new Uint16Array(width * height);
  const sourceWidth = masksToInclude[0].width;
  const sourceHeight = masksToInclude[0].height;

  masksToInclude.forEach((mask, maskIndex) => {
    for (let y = 0; y < height; y += 1) {
      const sourceY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / height));
      for (let x = 0; x < width; x += 1) {
        const sourceX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / width));
        if (mask.data[sourceY * sourceWidth + sourceX]) {
          map[y * width + x] = maskIndex + 1;
        }
      }
    }
  });

  return map;
}

function setMlStatus(message, isError = false) {
  if (!elements.mlStatus) return;
  elements.mlStatus.textContent = message;
  elements.mlStatus.classList.toggle("is-error", isError);
}

function fillComponentAction() {
  if (mlCurrentMask && !mlKeptMasks.includes(mlCurrentMask)) {
    mlKeptMasks.push(mlCurrentMask);
    mlCurrentMask = null;
    elements.mlKeep.disabled = true;
    drawMlOverlay();
  }
  if (mlKeptMasks.length === 0) return;
  const targetIndex = mlKeptMasks.length;
  fillColorsMap.set(targetIndex, getRGBAForFillSelection(fillColorSelection));
  scheduleRender(0);
  setMlStatus(`Component ${targetIndex} filled.`);
}

function clearBackgroundAction() {
  backgroundFillColor = getRGBAForFillSelection(fillColorSelection);
  scheduleRender(0);
  setStatus("Background cleared.", "success");
}

function resetFillsAction() {
  clearFills();
  scheduleRender(0);
  setStatus("Fills reset.", "success");
}

function clearFills() {
  fillColorsMap.clear();
  backgroundFillColor = null;
}

function clearErasedLinesAction() {
  erasedLinesMask = null;
  erasedMaskWidth = 0;
  erasedMaskHeight = 0;
  clearEraserOverlay();
  scheduleRender(0);
  setStatus("Erased lines restored.", "success");
}

function updateFillButtonState(disabled) {
  if (elements.fillComponent) elements.fillComponent.disabled = disabled;
  if (elements.quickFillComponent) elements.quickFillComponent.disabled = disabled;
}

function setToolMode(mode) {
  currentTool = mode;
  if (elements.toolSelect) elements.toolSelect.classList.toggle("is-active", mode === "select");
  if (elements.toolEraser) elements.toolEraser.classList.toggle("is-active", mode === "eraser");
  if (elements.quickEraserToggle) elements.quickEraserToggle.classList.toggle("is-active", mode === "eraser");
  if (elements.resultArtboard) elements.resultArtboard.classList.toggle("is-eraser-mode", mode === "eraser");
  if (mode !== "eraser") {
    clearEraserOverlay();
  }
}

function getRGBAForFillSelection(selection) {
  switch (selection) {
    case "transparent":
      return [0, 0, 0, 0];
    case "white":
      return [255, 255, 255, 255];
    case "cream":
      return [217, 208, 189, 255];
    case "dark":
      return [24, 24, 29, 255];
    default:
      return [217, 208, 189, 255];
  }
}

function handlePointerDown(event) {
  if (currentTool !== "eraser" || !source) return;
  isErasing = true;
  if (typeof elements.resultCanvas.setPointerCapture === "function") {
    try {
      elements.resultCanvas.setPointerCapture(event.pointerId);
    } catch {}
  }
  eraseAtPointer(event);
}

function handlePointerMove(event) {
  if (currentTool !== "eraser" || !source) return;
  drawEraserCursor(elements.resultCanvas, event);
  if (isErasing) {
    eraseAtPointer(event);
  }
}

function handlePointerUp() {
  if (isErasing) {
    isErasing = false;
  }
}

function eraseAtPointer(event) {
  const canvas = elements.resultCanvas;
  if (!canvas || !canvas.width) return;
  const coords = getCanvasPixelCoords(canvas, event);
  const width = canvas.width;
  const height = canvas.height;

  if (
    !erasedLinesMask
    || erasedMaskWidth !== width
    || erasedMaskHeight !== height
  ) {
    erasedLinesMask = new Uint8Array(width * height);
    erasedMaskWidth = width;
    erasedMaskHeight = height;
  }

  const brushRadius = Math.max(1, Math.round(Number(elements.eraserSize ? elements.eraserSize.value : 16) / 2));
  const r2 = brushRadius * brushRadius;

  for (let dy = -brushRadius; dy <= brushRadius; dy += 1) {
    const py = coords.y + dy;
    if (py < 0 || py >= height) continue;
    for (let dx = -brushRadius; dx <= brushRadius; dx += 1) {
      if (dx * dx + dy * dy > r2) continue;
      const px = coords.x + dx;
      if (px < 0 || px >= width) continue;
      erasedLinesMask[py * width + px] = 1;
    }
  }

  scheduleRender(0);
}

function getCanvasPixelCoords(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / (rect.width || 1);
  const scaleY = canvas.height / (rect.height || 1);
  return {
    x: Math.floor((event.clientX - rect.left) * scaleX),
    y: Math.floor((event.clientY - rect.top) * scaleY),
  };
}

function drawEraserCursor(canvas, event) {
  const overlay = elements.eraserOverlay;
  if (!overlay || !canvas || currentTool !== "eraser") {
    clearEraserOverlay();
    return;
  }
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  const coords = getCanvasPixelCoords(canvas, event);
  const brushRadius = Math.max(1, Number(elements.eraserSize ? elements.eraserSize.value : 16) / 2);

  const context = overlay.getContext("2d");
  context.clearRect(0, 0, overlay.width, overlay.height);
  context.strokeStyle = "#ff6c56";
  context.lineWidth = Math.max(1, Math.round(canvas.width / 250));
  context.beginPath();
  context.arc(coords.x, coords.y, brushRadius, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "rgba(255, 108, 86, 0.25)";
  context.fill();
}

function clearEraserOverlay() {
  const overlay = elements.eraserOverlay;
  if (!overlay || !overlay.width) return;
  const context = overlay.getContext("2d");
  context.clearRect(0, 0, overlay.width, overlay.height);
}
