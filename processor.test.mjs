import assert from "node:assert/strict";
import test from "node:test";
import { fitSize, stylizeImageData } from "./processor.mjs";

function makeImageData(width, height, pixelAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const color = pixelAt(x, y);
      data.set([...color, 255], offset);
    }
  }
  return { data, width, height };
}

test("fitSize preserves the aspect ratio along the requested long edge", () => {
  assert.deepEqual(fitSize(4000, 3000, 96), { width: 96, height: 72 });
  assert.deepEqual(fitSize(900, 1600, 128), { width: 72, height: 128 });
});

test("stylization is deterministic and keeps image dimensions", () => {
  const source = makeImageData(12, 10, (x, y) => [
    x * 19,
    y * 22,
    (x + y) * 10,
  ]);
  const first = stylizeImageData(source, { paletteSize: 6, smoothing: 1 });
  const second = stylizeImageData(source, { paletteSize: 6, smoothing: 1 });

  assert.equal(first.imageData.width, 12);
  assert.equal(first.imageData.height, 10);
  assert.deepEqual(first.palette, second.palette);
  assert.deepEqual(first.imageData.data, second.imageData.data);
});

test("the quantized art uses no more than the palette plus ink", () => {
  const source = makeImageData(24, 20, (x, y) => [
    (x * 29 + y * 7) % 256,
    (x * 11 + y * 31) % 256,
    (x * 17 + y * 13) % 256,
  ]);
  const result = stylizeImageData(source, {
    paletteSize: 5,
    edgeThreshold: 0.2,
    outlineStrength: 1,
    inkColor: [15, 15, 18],
  });
  const colors = new Set();

  for (let offset = 0; offset < result.imageData.data.length; offset += 4) {
    colors.add([
      result.imageData.data[offset],
      result.imageData.data[offset + 1],
      result.imageData.data[offset + 2],
    ].join(","));
  }

  assert.ok(colors.size <= 6, `Expected at most 6 colors, received ${colors.size}`);
});

test("a strong component boundary receives a dark ink contour", () => {
  const source = makeImageData(20, 20, (x) => (
    x < 10 ? [232, 215, 70] : [28, 64, 152]
  ));
  const result = stylizeImageData(source, {
    paletteSize: 3,
    edgeThreshold: 0.08,
    outlineStrength: 1,
    inkColor: [15, 15, 18],
  });
  let inkPixelsNearBoundary = 0;

  for (let y = 2; y < 18; y += 1) {
    for (let x = 8; x <= 11; x += 1) {
      const offset = (y * 20 + x) * 4;
      if (
        result.imageData.data[offset] === 15
        && result.imageData.data[offset + 1] === 15
        && result.imageData.data[offset + 2] === 18
      ) {
        inkPixelsNearBoundary += 1;
      }
    }
  }

  assert.ok(inkPixelsNearBoundary >= 12, "Expected a coherent ink line at the component boundary");
});

test("component cleanup removes isolated paint-noise regions", () => {
  const source = makeImageData(20, 20, (x, y) => {
    if (x === 10 && y === 10) return [250, 245, 30];
    return [118, 42, 35];
  });
  const result = stylizeImageData(source, {
    paletteSize: 3,
    smoothing: 0,
    regionCleanup: 3,
    edgeThreshold: 0.5,
  });
  const centerOffset = (10 * 20 + 10) * 4;
  const neighborOffset = (10 * 20 + 9) * 4;

  assert.deepEqual(
    [...result.imageData.data.slice(centerOffset, centerOffset + 3)],
    [...result.imageData.data.slice(neighborOffset, neighborOffset + 3)],
  );
});

test("an ML component map contributes a one-pixel component boundary", () => {
  const width = 24;
  const height = 16;
  const source = makeImageData(width, height, () => [110, 110, 110]);
  const componentMap = new Uint16Array(width * height);

  for (let y = 4; y < 12; y += 1) {
    for (let x = 7; x < 17; x += 1) {
      componentMap[y * width + x] = 1;
    }
  }

  const result = stylizeImageData(source, {
    paletteSize: 3,
    edgeThreshold: 0.8,
    outlineWidth: 1,
    componentMap,
  });
  let boundaryInk = 0;
  let interiorInk = 0;

  for (let y = 4; y < 12; y += 1) {
    for (let x = 7; x < 17; x += 1) {
      const offset = (y * width + x) * 4;
      const isInk = (
        result.imageData.data[offset] === 15
        && result.imageData.data[offset + 1] === 15
        && result.imageData.data[offset + 2] === 18
      );
      if (!isInk) continue;
      if (x === 7 || x === 16 || y === 4 || y === 11) boundaryInk += 1;
      else interiorInk += 1;
    }
  }

  assert.equal(boundaryInk, 32);
  assert.equal(interiorInk, 0);
});

test("suppressInnerLines removes automatic interior noise lines inside ML components", () => {
  const width = 30;
  const height = 30;
  // High contrast checkerboard pattern inside component that would normally produce edge noise
  const source = makeImageData(width, height, (x, y) => (
    (x + y) % 2 === 0 ? [240, 240, 240] : [20, 20, 20]
  ));
  const componentMap = new Uint16Array(width * height);
  for (let y = 5; y < 25; y += 1) {
    for (let x = 5; x < 25; x += 1) {
      componentMap[y * width + x] = 1;
    }
  }

  const resultWithSuppression = stylizeImageData(source, {
    edgeThreshold: 0.1,
    componentMap,
    suppressInnerLines: true,
  });

  let interiorInkCount = 0;
  for (let y = 6; y < 24; y += 1) {
    for (let x = 6; x < 24; x += 1) {
      const offset = (y * width + x) * 4;
      if (
        resultWithSuppression.imageData.data[offset] === 15
        && resultWithSuppression.imageData.data[offset + 1] === 15
        && resultWithSuppression.imageData.data[offset + 2] === 18
      ) {
        interiorInkCount += 1;
      }
    }
  }

  assert.equal(interiorInkCount, 0, "Expected no interior ink lines inside component when suppressInnerLines is active");
});

test("erasedLinesMask removes specified ink lines from final output", () => {
  const source = makeImageData(20, 20, (x) => (
    x < 10 ? [240, 240, 240] : [20, 20, 20]
  ));

  const initial = stylizeImageData(source, { edgeThreshold: 0.1 });
  const erasedLinesMask = new Uint8Array(20 * 20);
  erasedLinesMask.fill(1);

  const erasedResult = stylizeImageData(source, {
    edgeThreshold: 0.1,
    erasedLinesMask,
  });

  let inkCount = 0;
  for (let offset = 0; offset < erasedResult.imageData.data.length; offset += 4) {
    if (
      erasedResult.imageData.data[offset] === 15
      && erasedResult.imageData.data[offset + 1] === 15
      && erasedResult.imageData.data[offset + 2] === 18
    ) {
      inkCount += 1;
    }
  }

  assert.equal(inkCount, 0, "Expected all ink lines to be erased where erasedLinesMask is set");
});

test("backgroundFill replaces background pixels with specified color or transparency", () => {
  const width = 20;
  const height = 20;
  const source = makeImageData(width, height, () => [100, 100, 100]);
  const fillMap = new Uint16Array(width * height);
  const backgroundFill = [255, 255, 255, 0]; // Transparent background

  const result = stylizeImageData(source, {
    fillMap,
    backgroundFill,
  });

  const firstPixelAlpha = result.imageData.data[3];
  assert.equal(firstPixelAlpha, 0, "Expected background pixels to be transparent when backgroundFill has alpha=0");
});

