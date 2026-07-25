# ML component boundaries

Mini Ink uses a hybrid boundary pipeline:

1. The automatic pass quantizes the photo and compares neighboring palette
   regions in OKLCH. Lightness and circular hue distance are weighted
   independently, with chroma used to reduce unstable hue measurements in
   nearly gray paint.
2. Small regions are merged before outlining so chips, dry-brushing, and photo
   noise are less likely to become lines.
3. The optional ML pass uses the lightweight
   `Xenova/slimsam-77-uniform` Segment Anything model. A click is a positive
   point prompt for a physical component. The selected mask's inner boundary is
   merged into the automatic map at one output pixel wide.

The click-guided design is intentional. A general model can segment a physical
shape without having to know miniature-specific labels such as armor plate,
deffgun, grot, or stowage. Fully automatic mask generation tends to produce
many overlapping proposals, including paint damage and shadows—the exact noise
this tool is intended to suppress.

The first ML use downloads Transformers.js and the model. Inference runs in the
browser with WebGPU when available, with a WebAssembly CPU fallback. The source
photo is not sent to a service.

## Implementation references

- [Meta Segment Anything](https://github.com/facebookresearch/segment-anything)
- [Official Transformers.js Segment Anything WebGPU example](https://github.com/huggingface/transformers.js-examples/tree/main/segment-anything-webgpu)
- [Transformers.js](https://github.com/huggingface/transformers.js)
- [ONNX Runtime WebGPU](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)
- [EdgeSAM](https://github.com/chongzhou96/EdgeSAM)

## Possible next step

An automatic proposal mode could sample a coarse grid of positive prompts,
discard masks below an IoU-confidence threshold, remove near-duplicates, and
retain only boundaries that agree with strong OKLCH transitions. It should be
optional: on densely painted miniatures, manual clicks give substantially more
control over which components deserve ink.
