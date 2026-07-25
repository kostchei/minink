const TRANSFORMERS_MODULE = (
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0"
);
const MODEL_ID = "Xenova/slimsam-77-uniform";

export class ComponentSegmenter {
  constructor(reportStatus = () => {}) {
    this.reportStatus = reportStatus;
    this.runtime = null;
    this.model = null;
    this.processor = null;
    this.imageProcessed = null;
    this.imageEmbeddings = null;
  }

  async load() {
    if (this.model) return;
    this.reportStatus("Loading the ML runtime…");
    this.runtime = await import(TRANSFORMERS_MODULE);
    const { SamModel, AutoProcessor } = this.runtime;
    const hasWebGpu = Boolean(navigator.gpu);

    this.reportStatus(
      hasWebGpu ? "Loading SlimSAM on the GPU…" : "Loading SlimSAM on the CPU…",
    );

    const progressCallback = (progress) => {
      if (!progress?.file || typeof progress.progress !== "number") return;
      this.reportStatus(`Loading model · ${Math.round(progress.progress)}%`);
    };

    try {
      this.model = await SamModel.from_pretrained(MODEL_ID, {
        dtype: hasWebGpu ? "fp16" : "fp32",
        device: hasWebGpu ? "webgpu" : "wasm",
        progress_callback: progressCallback,
      });
    } catch (error) {
      if (!hasWebGpu) throw error;
      this.reportStatus("GPU unavailable; loading the CPU version…");
      this.model = await SamModel.from_pretrained(MODEL_ID, {
        dtype: "fp32",
        device: "wasm",
        progress_callback: progressCallback,
      });
    }
    this.processor = await AutoProcessor.from_pretrained(MODEL_ID);
  }

  async encode(canvas) {
    if (!this.model || !this.processor) {
      throw new Error("The component model is not loaded.");
    }

    const { RawImage } = this.runtime;
    const image = await RawImage.fromURL(canvas.toDataURL("image/jpeg", 0.92));
    this.imageProcessed = await this.processor(image);
    this.imageEmbeddings = await this.model.get_image_embeddings(
      this.imageProcessed,
    );
  }

  async segment(normalizedPoint) {
    if (!this.imageEmbeddings || !this.imageProcessed) {
      throw new Error("The photo has not been encoded.");
    }

    const { Tensor, RawImage } = this.runtime;
    const reshaped = this.imageProcessed.reshaped_input_sizes[0];
    const inputPoints = new Tensor(
      "float32",
      [
        normalizedPoint[0] * reshaped[1],
        normalizedPoint[1] * reshaped[0],
      ],
      [1, 1, 1, 2],
    );
    const inputLabels = new Tensor("int64", [1n], [1, 1, 1]);
    const { pred_masks: predMasks, iou_scores: scores } = await this.model({
      ...this.imageEmbeddings,
      input_points: inputPoints,
      input_labels: inputLabels,
    });
    const masks = await this.processor.post_process_masks(
      predMasks,
      this.imageProcessed.original_sizes,
      this.imageProcessed.reshaped_input_sizes,
    );
    const mask = RawImage.fromTensor(masks[0][0]);
    const maskCount = scores.data.length;
    let bestMask = 0;

    for (let index = 1; index < maskCount; index += 1) {
      if (scores.data[index] > scores.data[bestMask]) bestMask = index;
    }

    const data = new Uint8Array(mask.width * mask.height);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = mask.data[maskCount * index + bestMask] === 1 ? 1 : 0;
    }

    return {
      data,
      width: mask.width,
      height: mask.height,
      score: scores.data[bestMask],
    };
  }
}
