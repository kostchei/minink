# Mini Ink

Mini Ink is a dependency-free, local photo stylizer for tabletop miniatures. It
reduces a photo to a compact palette and low pixel resolution, then adds dark
contours around strong color and light boundaries.

## Run locally

On Windows, double-click:

```text
Start Mini Ink.cmd
```

The launcher starts the private local server and opens Mini Ink in the default
browser. Keep its small terminal window open while using the tool.

Alternatively, from the repository root:

```powershell
python -m http.server 4173
```

Then open [http://localhost:4173](http://localhost:4173).

Do not open `index.html` directly. Browsers block its JavaScript modules under
the `file://` protocol, which leaves the drop zone visible but inactive. The
page now displays an explicit warning when this happens.

All processing happens in the browser. The selected photo is not uploaded or
written to disk unless you use **Download PNG**.

## Use

1. Drop a JPG, PNG, or WebP anywhere in the page, or click the photo chooser.
2. Start with an art-direction preset.
3. Tune the resolution, number of colors, edge detail, and ink weight. Use
   **Component cleanup** to merge tiny paint and photo-noise regions before the
   black contour pass.
4. Tune **Hue boundary** and **Value boundary** independently. Hue is weighted
   strongly by default so differently painted materials separate even when
   their brightness is similar.
5. Optionally enable **ML component lines**, click a physical part in the
   original photo, and keep its boundary. Repeat for the important wheels,
   panels, figures, weapons, or cargo.
6. Choose a true-pixel or crisp enlarged export and download the PNG.

The default **Classic ink** preset is tuned for detailed vehicles and groups of
figures photographed against a plain background. **Chunky sprite** creates a
more aggressively pixelated result; **Dark graphic** emphasizes heavy component
outlines.

### Optional ML boundaries

The optional component picker uses the lightweight
`Xenova/slimsam-77-uniform` Segment Anything model through Transformers.js.
The first use downloads the browser runtime and model files; mask inference and
the photo stay in the browser. A click provides the point prompt, and the kept
mask boundary is merged with the hue/value line map at one output pixel wide.

This is deliberately click-guided rather than fully automatic: general-purpose
models do not have reliable semantic labels for custom-painted miniature
vehicle parts, while a point prompt tells the model exactly which physical
component matters.

See [ML_BOUNDARIES.md](ML_BOUNDARIES.md) for the pipeline rationale, references,
and the path to a future automatic-proposal mode.

## Test

```powershell
node --test processor.test.mjs
```
